# Release 2.4 status

```stats
- {label: Tests, value: "1,204", delta: "+38", tone: ok}
- {label: Failures, value: "0", delta: "-3", tone: ok, note: since Monday}
- {label: p95 latency, value: 420 ms, delta: "+60 ms", tone: risk}
- {label: Open PRs, value: "4"}
```

```steps
items:
  - {title: Design, status: done, when: Mon}
  - {title: Build, status: doing, when: Tue, body: "Two of **four** services left"}
  - {title: Security review, status: blocked, body: Waiting on the vendor's report}
  - {title: Ship, status: todo, when: Fri}
```

```table
columns:
  - service
  - {name: owner, label: Owner}
  - {name: size, label: Changed lines, type: number}
  - {name: day, label: Merged, type: date}
rows:
  - [api, Ada, 1204, 2026-11-03]
  - [web, Lin, 312, 2026-11-05]
  - [worker, Ada, 87, 2026-11-06]
  - [billing, Sam, 9, 2026-11-07]
sort: -size
filter: true
```
