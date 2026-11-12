# Research

## 4. Risks

- double charge on retry. Gamma bounds apply here.

## 5. Rules

### double charge

- idem: every write carries an idempotency key (code) src/idem.js:10
- values: stored values stay exact; round once, only when shown (code) src/values.js:10

## 6. Next

- a tool
