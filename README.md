# WORLD KNOWLEDGE

Öffentliches, kostenlos startendes Wissensarchiv. Version 0.1 sammelt kurze deutschsprachige Wikipedia-Einleitungen und macht sie durchsuchbar.

## Backend

WORLD KNOWLEDGE verwendet das bestehende Supabase-Projekt **KDS-AI-v1**. Die Datenbankobjekte sind mit `world_knowledge_` präfixiert, damit sie keine KDS-AI- oder anderen Projekt-Tabellen überschreiben.

- Tabellen: `world_knowledge_articles`, `world_knowledge_collector_runs`, `world_knowledge_collector_state`
- Edge Function: `world-knowledge-collector`
- Frontend-Konfiguration: `assets/js/config.js`
- Öffentlicher Browser-Key: Supabase Publishable Key
- Server-Key: bleibt ausschließlich in der Supabase-Umgebung und wird niemals ins GitHub-Repository geschrieben.

## Sammlung

Ein Website-Besuch kann einen Sammellauf anfordern. Pro Lauf werden höchstens fünf zufällige Wikipedia-Artikel-Einleitungen verarbeitet. Eine globale Sperre begrenzt die Frequenz auf einen Lauf pro 90 Sekunden. Wenn niemand die Website besucht, pausiert die Sammlung. Das ist kein dauerhaft laufender Hintergrundprozess.

Wikipedia-Inhalte stehen unter CC BY-SA 4.0. Jeder gespeicherte Artikel enthält Quelllink und Lizenzangabe. Bei Weiterverwendung müssen Namensnennung und Lizenzbedingungen eingehalten werden.

## Kosten und Grenzen

Für diese erste Version sind keine zusätzlichen KI- oder Wikipedia-API-Schlüssel erforderlich. Supabase- und GitHub-Free-Tarife haben Nutzungsgrenzen; unbegrenzter Speicher, unbegrenzter Traffic oder eine unbegrenzte Sammlung werden nicht versprochen.

## Noch nicht enthalten

Version 0.1 ist ein Sammler mit Suchoberfläche, noch kein Chatbot und kein vollständiger Wikipedia-Spiegel. Weitere offene Quellen, semantische Suche und eine KI-Antwortfunktion können später ergänzt werden.
