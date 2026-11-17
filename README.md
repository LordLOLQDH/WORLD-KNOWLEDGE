# WORLD KNOWLEDGE

Öffentliche Wissensplattform mit durchsuchbarem Archiv, automatischem Wikipedia-Import und KI-gestützten Antworten.

## Hosting und Backend

- Frontend: GitHub Pages
- Datenbank und Edge Function: bestehendes Supabase-Projekt KDS-AI-v1
- KI: Groq API, serverseitig über \`GROQ_API_KEY\`
- Browser-Zugang: öffentlich, kein Login erforderlich
- Alle Datenbankobjekte sind mit \`world_knowledge_\` präfixiert, damit andere KDS-AI-Daten unberührt bleiben.

## Funktionen

- Nutzer können Fragen und vollständige Sätze eingeben.
- Zuerst wird das eigene Archiv mit deutscher Volltextsuche durchsucht.
- Wenn keine gespeicherten Treffer existieren, wird die deutschsprachige Wikipedia-Suche verwendet.
- Bis zu fünf passende Einleitungen werden gespeichert und als Quellen zurückgegeben.
- Groq beantwortet Fragen anhand der verfügbaren Quellen.
- KI-Antworten und die zugehörigen Fragen werden dauerhaft in \`world_knowledge_queries\` archiviert.
- Gesammelte Artikel liegen in \`world_knowledge_articles\` und werden auf einer eigenen Seite \`archive.html\` angezeigt.
- KI-Antworten werden mit Marked gerendert und anschließend mit DOMPurify bereinigt. Unterstützt werden Fettdruck, Überschriften, Listen, Links, Code und Tabellen.
- Während die Startseite sichtbar und aktiv ist, fragt der Browser automatisch etwa alle 95 Sekunden einen neuen Sammellauf an. Der globale Datenbank-Lock verhindert parallele Importe. Ein Lauf sammelt bis zu fünf zufällige Wikipedia-Einleitungen.

## Tabellen

- \`world_knowledge_articles\`: gespeicherte Wissensartikel
- \`world_knowledge_queries\`: Fragen, KI-Antworten und Quellenverweise
- \`world_knowledge_collector_runs\`: Protokoll der Sammelläufe
- \`world_knowledge_collector_state\`: globaler Sammelstatus
- \`world_knowledge_ai_limits\`: gehashte IP-Werte für KI-Anfragebegrenzung

## Edge Function

\`world-knowledge-collector\` unterstützt:
- \`action: "collect"\`: zufällige Wikipedia-Einleitungen importieren
- \`action: "search"\`: Archivsuche, Wikipedia-Fallback, Groq-Antwort und Archivierung der Frage

Supabase Secret Key und \`GROQ_API_KEY\` bleiben ausschließlich auf dem Server. Der Browser enthält nur die öffentliche Supabase Publishable Key.

## Kontinuierliche Sammlung: Grenzen

Der Sammler läuft nicht als unbegrenzter Hintergrundprozess. Er wiederholt Aufrufe, solange die Website geöffnet und sichtbar ist. Browser können Tabs im Hintergrund, bei gesperrtem Bildschirm oder bei Energiesparmodi pausieren. Wird die Website geschlossen, stoppt die Sammlung. Der globale Mindestabstand beträgt 90 Sekunden. Das schützt die kostenlosen Kontingente und verhindert parallele Läufe.

## Quellen und Lizenz

Wikipedia-Einleitungen werden mit Original-URL und CC BY-SA 4.0-Hinweis gespeichert. Bei Weiterverwendung müssen Lizenz und Namensnennung beachtet werden.

## Kosten und Limits

Die Architektur nutzt kostenlose Hosting- und Datenbankkontingente, soweit verfügbar. Supabase- und Groq-Limits gelten. Unbegrenzte kostenlose Nutzung kann nicht zugesichert werden.
