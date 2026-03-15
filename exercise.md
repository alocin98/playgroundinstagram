# 📸 Übung Instagram 

Deine Aufgabe ist es, mit SQL-Befehlen (`INSERT`, `SELECT`, `UPDATE`) unser soziales Netzwerk zu befüllen. Nutze die Struktur unserer Datenbank, um die folgenden Aktionen durchzuführen. **Notiere dir zu jeder Aufgabe den SQL-Befehl, den du verwendet hast!** Schaue dir die Datenbankstruktur an und überlege dir, wie du die Aufgaben am besten löst.

## Datenbankstruktur


#### Teil 1: Dein Profil & Dein Content (INSERT & SELECT)

**1 - Erstelle dein eigenes Konto** 
Schaue dir die Datenstruktur an und überlege dir, wie du einen Benutzer machen kannst. Als Profilbild kannst du diese Seite verwenden: https://getavataaars.com/

**2 - Veröffentliche einen ersten Beitrag**
Suche ein Bild, welches du posten kannst. Das Bild wird als URL eingefügt. Finde dazu ein Bild im Internet, wähle dann mit rechtsklick "url kopieren" und füge das geeignet in die Tabellenstruktur ein.

**3 - Lass dir den Feed anzeigen**
Schreibe ein Query, welches dir den aktuellen Feed anzeigt.

**4 - Finde den Account deines Sitznachbarn**
Suche in der Datenbank gezielt den Account deines Sitznachbarns. Notiere dier die `id`!

**5 - Schau dir die Beiträge deines Nachbarn an:** Lass dir nur die Posts anzeigen, die von der `user_id` deines Sitznachbarn erstellt wurden.

**6 - Kommentiere einen Beitrag**
Schreibe einen Kommentar unter einen Beitrag deiner Wahl.

**7 - Verteile ein paar Likes**
Suche dir 2-3 andere Beiträge aus dem Feed aus und erhöhe deren Like-Zahl um jeweils 1. *(Achtung: Denk unbedingt an die `WHERE`-Klausel, sonst likest du aus Versehen jeden Post in der Datenbank!)*

**Teil 3: Kommunikation & Analyse (Fortgeschrittene Abfragen)**
8. **Schreibe eine Direktnachricht:** Beginne einen Chat mit einem anderen Nutzer. Erstelle dazu zuerst eine Nachricht in der `chats`-Tabelle und verknüpfe danach eure beiden User-IDs mit der neuen Chat-ID in der `chats_users`-Tabelle.
9. **Prüfe deinen Posteingang:** Schreibe eine Abfrage, um zu sehen, in welchen Chats du Mitglied bist (Suche nach deiner `user_id` in der `chats_users`-Tabelle).
10. **Finde den beliebtesten Beitrag:** Wer ist der Star unserer Klasse? Finde den Post mit den absolut meisten Likes heraus. *(Tipp: Schau dir dazu einmal die Befehle `ORDER BY` und `LIMIT` an).*

---

Möchtest du, dass ich dir passend zu diesem Arbeitsblatt noch einen **Lösungsbogen (Cheat Sheet) mit den exakten SQL-Befehlen** erstelle, damit du die Ergebnisse der Schüler schnell kontrollieren kannst?