# Cache store: pick one

The session cache outgrew the in-memory map. Two stores fit; the form at the end records your call.

> [!IMPORTANT] Migration window
> Either choice needs **one restart** of the API. Plan it outside business hours.

```options
- title: SQLite
  recommended: true
  body: Embedded file next to the API, zero setup
  pros: [no new service, fast reads]
  cons: [one writer at a time]
- title: Postgres
  body: The database we already run
  pros: [concurrent writers, shared across hosts]
  cons: [network hop, needs a schema]
```

```form
title: Before I start
submit: Send
questions:
  - name: ttl
    label: How long should entries live?
    required: true
    choices: [1 hour, 1 day, {value: week, label: 1 week, recommended: true}]
  - name: extras
    label: Also do
    type: multi
    choices: [WAL mode, Nightly backup, Metrics]
  - name: note
    label: Anything I should know?
```
