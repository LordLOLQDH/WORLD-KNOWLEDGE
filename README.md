# WORLD KNOWLEDGE

Öffentliches Wissensarchiv mit automatischer Erweiterung durch Wikipedia und KI-gestützten Antworten. Die Website ist öffentlich; Besucher benötigen kein Konto.

## Backend

WORLD KNOWLEDGE verwendet das bestehende Supabase-Projekt **KDS-AI-v1**. Alle Datenbankobjekte tragen den Präfix `world_knowledge_`, damit andere Projekte und KDS-AI-Daten unberührt bleiben.

- Tabellen: `world_knowledge_articles`, `world_knowledge_collector_runs`, `world_knowledge_collector_state`, `world_knowledge_ai_limits`
- Edge Function: `world-knowledge-collector`
- Frontend: GitHub Pages, `assets/js/app.js`
- Öffentlicher Browser-Key: Supabase Publishable Key
- Supabase Secret Key und `GROQ_API_KEY`: ausschließlich als serverseitige Supabase-Umgebungsvariablen, niemals im Browser oder Repository.

Die Funktion unterstützt die neuen Supabase-Umgebungsvariablen `SUPABASE_SECRET_KEYS` sowie den älteren `SUPABASE_SERVICE_ROLE_KEY`.

## Suche und KI

1. Bei einer Suche wird zuerst die Volltextsuche des gespeicherten Archivs verwendet.
2. Gibt es keinen Treffer, wird die deutschsprachige Wikipedia-Suche aufgerufen.
3. Bis zu fünf passende Wikipedia-Einleitungen werden mit URL und Lizenzangabe gespeichert.
4. Groq erstellt anschließend eine deutschsprachige Antwort auf Basis der angezeigten Quellen.

Verwendetes Groq-Modell: `openai/gpt-oss-20b`. Die KI-Antwort wird serverseitig erzeugt. Der API-Schlüssel bleibt in Supabase. Pro IP-Adresse gilt ein kurzer KI-Anfrageabstand als Schutz vor Missbrauch. Groq-Nutzung unterliegt den aktuellen Kontingenten und Preisen des Groq-Kontos.

## Automatische Sammlung

Ein Website-Besuch kann einen Sammellauf auslösen. Pro Lauf werden höchstens fünf zufällige Wikipedia-Einleitungen importiert. Eine globale Sperre begrenzt die Frequenz auf einen Lauf pro 90 Sekunden. Wenn niemand die Website besucht, pausiert die Sammlung. Das ist kein dauerhaft laufender Hintergrundprozess.

Wikipedia-Inhalte stehen unter CC BY-SA 4.0. Jeder gespeicherte Artikel enthält Quelllink und Lizenzangabe. Bei Weiterverwendung müssen Namensnennung und Lizenzbedingungen eingehalten werden.

## Sicherheit und Kosten

- Browser-Rollen dürfen Artikel und Laufprotokolle nur lesen.
- Schreibzugriffe laufen ausschließlich serverseitig über den Supabase Secret Key.
- Der Groq-Schlüssel wird nicht an Besucher ausgeliefert.
- Supabase-, GitHub- und Groq-Kontingente gelten weiterhin. Kostenfreiheit und unbegrenzte Nutzung werden nicht garantiert.

## Projektstand

Version 0.2: öffentliche Suche, Wikipedia-Fallback mit automatischem Speichern, Groq-Antworten und manuell/bei Besuch startbare Sammlung.
