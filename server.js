import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { handler as astroHandler } from './dist/server/entry.mjs';
import pool from './db.js';
import hbs from 'hbs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server);

// Configure Handlebars
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
hbs.registerPartials(path.join(__dirname, 'views/partials'));
hbs.registerHelper('substring', (str, start, end) => (str || '').substring(start, end));
hbs.registerHelper('gt', (a, b) => a > b);

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Socket.io connection log ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Attach Socket.io to Express App for route access
app.set('io', io);

// ─── DB-Polling Change Detection (every 10 seconds) ──────────────────────────
//
// Watermarks track the "last seen" state so we can spot new rows / changes.
// They are initialised on server start by querying the current DB state,
// so existing rows do NOT trigger notifications on boot.
//
let watermarks = {
  lastPostId: 0,
  lastUserId: 0,
  totalLikes: 0,
  lastChatId: 0,
};

async function initWatermarks() {
  try {
    const [posts, users, likes, chats] = await Promise.all([
      pool.query('SELECT COALESCE(MAX(id), 0) AS val FROM posts'),
      pool.query('SELECT COALESCE(MAX(id), 0) AS val FROM users'),
      pool.query('SELECT COALESCE(SUM(likes), 0) AS val FROM posts'),
      pool.query('SELECT COALESCE(MAX(id), 0) AS val FROM messages'),
    ]);
    watermarks.lastPostId  = parseInt(posts.rows[0].val,  10);
    watermarks.lastUserId  = parseInt(users.rows[0].val,  10);
    watermarks.totalLikes  = parseInt(likes.rows[0].val,  10);
    watermarks.lastChatId  = parseInt(chats.rows[0].val,  10);
    console.log('[poll] Watermarks initialised:', watermarks);
  } catch (err) {
    console.error('[poll] Failed to initialise watermarks:', err.message);
  }
}

/** Build a small HTML card for a post (used for live feed injection). */
function buildPostCard(post) {
  const img = post.image_url
    ? `<img src="${post.image_url}" alt="Post image" class="object-cover w-full h-full">`
    : `<span class="text-gray-400">No Image provided</span>`;
  const loc = post.location
    ? `<span class="text-xs text-gray-500">${post.location}</span>`
    : '';
  const pic = post.profile_pic || '';
  return `
  <article class="bg-white border border-gray-300 rounded-lg overflow-hidden shadow-sm" data-post-id="${post.id}">
    <div class="flex items-center justify-between p-3 border-b border-gray-100">
      <div class="flex items-center">
        <img src="${pic}" alt="${post.username}" class="h-8 w-8 rounded-full mr-3 object-cover">
        <span class="font-bold text-sm">${post.username}</span>
      </div>
      ${loc}
    </div>
    <div class="bg-gray-100 aspect-square flex items-center justify-center overflow-hidden">
      ${img}
    </div>
    <div class="p-4">
      <div class="flex gap-4 mb-2">
        <button class="font-bold cursor-pointer hover:text-red-500 transition-colors">♥ Like</button>
        <button class="font-bold cursor-pointer hover:text-blue-500 transition-colors">💬 Comment</button>
      </div>
      <p class="font-bold text-sm mb-1">${post.likes} likes</p>
      <p class="text-sm"><span class="font-bold mr-2">${post.username}</span>${post.description || ''}</p>
    </div>
  </article>`;
}

async function pollDatabase() {
  try {
    // ── 1. New posts ──────────────────────────────────────────────────────────
    const newPostsRes = await pool.query(`
      SELECT posts.*, users.username, users.profile_pic
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id > $1
      ORDER BY posts.id ASC
    `, [watermarks.lastPostId]);

    if (newPostsRes.rows.length > 0) {
      for (const post of newPostsRes.rows) {
        io.emit('new_post', {
          message: `📸 ${post.username} just shared a new post!`,
          html: buildPostCard(post),
          postId: post.id,
        });
      }
      watermarks.lastPostId = newPostsRes.rows[newPostsRes.rows.length - 1].id;
    }

    // ── 2. New users ──────────────────────────────────────────────────────────
    const newUsersRes = await pool.query(
      'SELECT id, username FROM users WHERE id > $1 ORDER BY id ASC',
      [watermarks.lastUserId]
    );

    if (newUsersRes.rows.length > 0) {
      for (const user of newUsersRes.rows) {
        io.emit('new_user', {
          message: `👤 Welcome to ${user.username}, who just joined!`,
          username: user.username,
        });
      }
      watermarks.lastUserId = newUsersRes.rows[newUsersRes.rows.length - 1].id;
    }

    // ── 3. New likes ──────────────────────────────────────────────────────────
    const likesRes = await pool.query('SELECT COALESCE(SUM(likes), 0) AS total FROM posts');
    const newTotal = parseInt(likesRes.rows[0].total, 10);
    if (newTotal > watermarks.totalLikes) {
      const diff = newTotal - watermarks.totalLikes;
      // Find which post(s) gained likes since last poll
      const likedPostRes = await pool.query(`
        SELECT posts.id, posts.likes, posts.user_id, users.username AS owner
        FROM posts
        JOIN users ON posts.user_id = users.id
        ORDER BY posts.likes DESC
        LIMIT 1
      `);
      const likedPost = likedPostRes.rows[0];
      io.emit('new_like', {
        message: `❤️ ${diff} new like${diff > 1 ? 's' : ''} on ${likedPost ? likedPost.owner + "'s" : 'a'} post!`,
        diff,
      });
      watermarks.totalLikes = newTotal;
    }

    // ── 4. New messages ───────────────────────────────────────────────────────
    const newChatsRes = await pool.query(`
      SELECT m.id, m.message,
             sender.username   AS sender_name,
             receiver.username AS receiver_name
      FROM messages m
      JOIN users AS sender   ON m.sender_id   = sender.id
      LEFT JOIN users AS receiver ON m.receiver_id = receiver.id
      WHERE m.id > $1
      ORDER BY m.id ASC
    `, [watermarks.lastChatId]);

    if (newChatsRes.rows.length > 0) {
      for (const chat of newChatsRes.rows) {
        const to = chat.receiver_name ? ` to ${chat.receiver_name}` : '';
        io.emit('new_message', {
          message: `💬 ${chat.sender_name} wrote a message: ${chat.message}`,
          sender: chat.sender_name,
          receiver: chat.receiver_name,
        });
      }
      watermarks.lastChatId = newChatsRes.rows[newChatsRes.rows.length - 1].id;
    }

  } catch (err) {
    console.error('[poll] Error during DB poll:', err.message);
  }
}

// ─── Handlebars Routes ────────────────────────────────────────────────────────
app.get('/feed', async (req, res) => {
  try {
    const [postsRes, commentsRes] = await Promise.all([
      pool.query(`
        SELECT posts.*, users.username, users.profile_pic
        FROM posts
        JOIN users ON posts.user_id = users.id
        ORDER BY posts.id DESC
      `),
      pool.query(`
        SELECT c.id, c.post_id, c.content, u.username
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.id ASC
      `),
    ]);

    // Group comments by post_id
    const commentsByPost = {};
    for (const c of commentsRes.rows) {
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
      commentsByPost[c.post_id].push({ id: c.id, content: c.content, username: c.username || 'unknown' });
    }

    const posts = postsRes.rows.map(post => ({
      ...post,
      comments: commentsByPost[post.id] || [],
    }));

    res.render('feed', { layout: 'layouts/main', title: 'Live Feed', posts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    res.render('users', { layout: 'layouts/main', title: 'Users', users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

app.get('/chats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.message,
             sender.username      AS sender_name,
             sender.profile_pic   AS sender_pic,
             receiver.id          AS receiver_id,
             receiver.username    AS receiver_name,
             receiver.profile_pic AS receiver_pic
      FROM messages m
      JOIN users AS sender        ON m.sender_id   = sender.id
      LEFT JOIN users AS receiver ON m.receiver_id = receiver.id
      ORDER BY m.id ASC
    `);

    // Group messages by receiver
    const receiverMap = new Map();
    for (const row of result.rows) {
      const key = row.receiver_id ?? '__none__';
      if (!receiverMap.has(key)) {
        receiverMap.set(key, {
          receiver_id:   row.receiver_id,
          receiver_name: row.receiver_name || '(no recipient)',
          receiver_pic:  row.receiver_pic  || '',
          messages: [],
        });
      }
      receiverMap.get(key).messages.push({
        id:          row.id,
        message:     row.message,
        sender_name: row.sender_name,
        sender_pic:  row.sender_pic,
      });
    }

    // Convert to array; newest activity first (highest message id last)
    const receivers = [...receiverMap.values()].sort(
      (a, b) => b.messages[b.messages.length - 1].id - a.messages[a.messages.length - 1].id
    );

    res.render('chats', {
      layout: 'layouts/main',
      title: 'Chats',
      receivers,
      receiversJson: JSON.stringify(receivers),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

// Fallback to Astro SSR Handler for other routes
app.use(astroHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  await initWatermarks();
  setInterval(pollDatabase, 10_000);
});
