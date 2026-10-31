# How a Human Tests It – A to Z

This guide lets a person who has never seen the code confirm that the cost-intake automation is a
**complete feature**. You only click around in **Notion**, **n8n** and **Gmail**, and send emails.

Every test says **what to do**, **where to look** and **what counts as a pass**. At the end there is a
checklist that maps every assessment requirement to the test that proves it.

> Time needed: about 45 minutes for everything, or about 15 minutes for the core path (T1–T4, T10, T12).

---

## 0. Before you start

| You need | Where |
|---|---|
| Notion workspace **Kevin Build Co.** | notion.so → sidebar → *Kevin Build Co.* |
| n8n running | http://localhost:5678 → workflow **Kevin Build Co - Cost Intake (email -> Notion)** |
| Workflow **Active** | In n8n, the toggle in the top-right of the workflow must be **on** (green) |
| A mailbox to send from | Any email account (your phone is fine) |
| The demo inbox | **samisiam851@gmail.com**. Notifications arrive here |
| Sample invoices | PDFs in `test/output/files/` (created by `npm run scenarios`), or your own |

**Two ways to send a test:**

- **By email (the real path):** send to **samisiam851+costs@gmail.com**. n8n checks the inbox about every minute.
  - This needs the Gmail credentials to be set up (README §5.4: `GMAIL_APP_PASSWORD`, then `npm run deploy`).
  - In n8n, the **Email Trigger (IMAP)** node must not be greyed out.
- **By command (no Gmail needed):** `npm run scenarios -- s01` sends the same kind of email to the workflow's test webhook.
  - Every test below names the matching scenario id, so you can use this path if Gmail isn't configured.

**Start clean:** run `npm run reset:demo`. It moves earlier test records to Notion's trash and recalculates the summaries. Part 2 data is not touched.

---

## 1. One-time setup of your "test cockpit" (5 minutes)

### 1.1 Notion – Project Costs

1. Open **Project Costs**.
2. Make sure these columns are visible (••• → *Properties*):
   - Description, Supplier, Document Ref, Amount, Currency, Payment Status
   - Document Date, Payment Due, Project, Document, Needs Review, Review Reason
   - Submission Count, Update Log
3. Add a view, **+ → Table → "Needs review"**, with the filter **Needs Review is checked**. This is the office admin's work queue.
4. Add a view, **+ → Table → "By supplier"**, grouped by **Supplier**.

### 1.2 Notion – Supplier Monthly Summary

1. Open **Supplier Monthly Summary** (on the same page as Project Costs).
2. Sort by **Month** descending, and show:
   - Supplier Name, Month, Currency
   - Total Paid, Total Unpaid, Total, Cost Count, Last Recalculated

### 1.3 n8n

1. Open the workflow and look at the canvas. The coloured sticky notes explain the 7 stages, left to right.
2. Open the **Executions** tab (top). Every email you send appears here as one run.

### 1.4 Write down a baseline

In **Supplier Monthly Summary**, note the row **Apex Timber & Frames – Oct 2026 (USD)**:

```
Before: Total Paid ______  Total Unpaid ______  Cost Count ______
```

After `reset:demo` it should be Paid 0 · Unpaid 33,900 · Count 1. That's the Part 2 "Joinery package" invoice.

---

## 2. The tests

For every test, the **pass criteria** are the boxes to tick.

### T1 – A new unpaid invoice is recorded (scenario `s01`)

**Do:**

- Email **samisiam851+costs@gmail.com**
- Subject: `Invoice INV-78102 - RIV-001 Riverside Home`
- Attach: `test/output/files/Apex-INV-78102.pdf`
- Send from any address. With the command path, the sender is the supplier's own address, `apex.timber.frames@example.com`.

**Look:**

1. **n8n → Executions:** a new run, status **Succeeded**. Click it, then click **Parse & Match** → output → `parsed`. You can see exactly what was read and how the project was found (`projectMethod: "project code"`).
2. **Notion → Project Costs:** a new row **"Roof trusses - stage 2"**.
3. Open the row:
   - the **Document** field holds the PDF; click it and it opens,
   - the page body has a 📥 note explaining what was extracted, followed by the original email.
4. **Supplier Monthly Summary:** Apex Timber & Frames – Oct 2026 (USD).
5. **Gmail (samisiam851@gmail.com):** a `[DEMO] Cost recorded: …` email.

**Pass if:**

- [ ] Supplier = Apex Timber & Frames, and **Supplier Contact** links to the Contacts entry
- [ ] Document Ref = INV-78102, Amount = 8,450, Currency = USD
- [ ] Payment Status = **Unpaid**, Document Date = 2026-10-28, Payment Due = **2026-11-27** (Net 30 was calculated)
- [ ] Project = **Riverside Home**, and the cost also appears on the Riverside Home project page (*Costs*)
- [ ] Needs Review is **unticked**
- [ ] Summary: Unpaid went up by **8,450**, Cost Count by **1** (vs your baseline)
- [ ] The email starts with the yellow **"This is a demo"** banner, which says it would go to **Mike Johnson** (Riverside's project manager)

### T2 – The same invoice sent again is NOT counted twice (scenario `s02`)

**Do:** forward the **same email** again, with a different subject such as `FW: …`.

**Pass if:**

- [ ] Project Costs still has **one** INV-78102 row
- [ ] On that row, **Submission Count = 2**, and **Update Log** has a new line "Duplicate submission ignored"
- [ ] The summary totals are **unchanged**
- [ ] **No** notification email (a duplicate isn't news)
- [ ] n8n run: **Decide Action** → output → `decision.action` = `"duplicate"`

### T3 – The paid copy updates the same record (scenario `s03`)

**Do:** send `test/output/files/Apex-INV-78102-PAID.pdf` (it says *Amount Paid $8,450 · Balance Due $0.00*).

**Pass if:**

- [ ] **Still one** INV-78102 row, and Payment Status is now **Paid**
- [ ] Update Log: "Payment status: Unpaid -> Paid", and Submission Count = 3
- [ ] Summary (Apex, Oct 2026): **Total Paid +8,450, Total Unpaid −8,450, Cost Count unchanged**. The money moved; it wasn't added.
- [ ] Email "[DEMO] Cost updated: …"

### T4 – An unpaid copy can't undo a payment (edge `e19`)

**Do:** send the original unpaid PDF (T1) again.

**Pass if:**

- [ ] The status stays **Paid**
- [ ] **Needs Review** is ticked, and the reason says the newer document says "Unpaid" but the record is "Paid", so "Paid" was kept
- [ ] The row appears in your **"Needs review"** view

### T5 – Missing project gets flagged, a human fixes it (scenario `s05`)

**Do:** send `BuildMart-INV-BM-5520.pdf` with a subject that has **no project code**.

**Pass if:**

- [ ] The row is created with **Project empty**, **Needs Review ticked**, and the reason "No project matched – add the project code…"
- [ ] The reasons also include **"Unpaid and overdue (due 2026-10-20)"**
- [ ] The email is "[DEMO] Needs review – …", and its banner says it would go to **Denise (office admin) and Kevin Walsh (owner)**

**Then act as the office admin:** in Notion, set **Project** to e.g. Skyline Development and untick **Needs Review**.

- [ ] Optional: re-send the same invoice with `SKY-001` in the subject. The workflow sees the project is already set, so it doesn't overwrite your choice and records a duplicate or update.

### T6 – Field employee, receipt typed in the email (scenario `s04`)

**Do:**

- Send from a staff-style address (scenario: `mike@kevinbuild.co`), with **no attachment**.
- Subject: `Receipt - fixings for Skyline`
- Body: `Picked up fixings at Home Depot for the Skyline job today. Receipt #4471, total $245.10, paid on the company card.`

**Pass if:**

- [ ] Supplier = **Home Depot** (not Mike: staff are submitters, not suppliers), Amount 245.10, **Paid**, Project **Skyline Development**
- [ ] Flagged: "Home Depot is not in Contacts (new supplier?)" and "Document date not found – used email received date"
- [ ] A new summary row: **Home Depot – Oct 2026 (USD)**, with Paid 245.10

### T7 – Photo of a paper receipt (scenario `s11`)

**Do:** send a phone photo, `MPL-001` in the subject, nothing else.

**Pass if:**

- [ ] The row is created on **Maple Court Extension**, and the **photo is attached** in Document
- [ ] Flagged "Photo/scanned receipt – no OCR, please check the fields manually", plus "Amount not found"
- [ ] A human can open the photo in Notion and type the amount in. That's the intended manual step.

### T8 – Corrected invoice with a new amount (scenarios `s09` → `s10`)

**Do:** send `CoastHire-CH-INV-10021.pdf` ($3,200), then `CoastHire-CH-INV-10021-corrected.pdf` ($3,450).

**Pass if:**

- [ ] **One** CH-INV-10021 row, Amount **3,450**
- [ ] Flagged "Amount changed on resubmission: 3,200.00 -> 3,450.00"
- [ ] Summary (CoastHire, Oct 2026): Unpaid includes **3,450, not 6,650**

### T9 – Several invoices in one email (edge `e01`)

**Do:** attach **two** different invoice PDFs to one email.

**Pass if:**

- [ ] **Two** rows are created, one per PDF, each with its own file
- [ ] n8n: the loop nodes show **2 runs** (use the run selector on a node)
- [ ] Each document gets its own notification

### T10 – Overseas supplier in another currency (scenario `s08`)

**Do:** send `LussoStone-LS-2026-118.pdf` (EUR 4,200, `LKC-001`).

**Pass if:**

- [ ] Currency **EUR**, Project **Lakeside Café Fit-out**, and flagged "Currency is EUR (not USD)" plus new supplier
- [ ] A **separate** summary row: **Lusso Stone Imports – Oct 2026 (EUR)**. Euros are never added to dollars.

### T11 – Project found from a purchase order number (scenario `s06`)

**Do:** send `ReadyMix-RM-INV-3388.pdf`. It mentions only **PO-1044**, no project name or code.

**Pass if:**

- [ ] Project = **Skyline Development**. Check in **Materials & Orders** that PO-1044 belongs to Skyline.

### T12 – Check the Supplier Monthly Summary by hand (the most important check)

1. In **Project Costs**, filter **Supplier contains "Apex"** and **Document Date is within October 2026**.
2. Add up **Amount** for rows with Payment Status = Paid, and separately for all other statuses.
3. Compare with **Supplier Monthly Summary → Apex Timber & Frames – Oct 2026 (USD)**.

**Pass if:**

- [ ] Total Paid = your Paid sum, Total Unpaid = your other sum, Cost Count = number of rows
- [ ] Repeat for one more supplier, e.g. CoastHire

*Shortcut:* `npm run verify` does this for every row and reports any mismatch.

### T13 – Notifications go to the right people

Open the demo emails from the tests above and read the yellow banner:

| Email from test | Banner must say it would go to |
|---|---|
| T1 (clean, Riverside) | Mike Johnson (project manager) |
| T5 (needs review) | Denise (office admin) **and** Kevin Walsh (owner) |
| T10 (Lakeside, needs review) | David Lee (PM) + Denise + Kevin |
| T2 (duplicate) | *no email at all* |

- [ ] All of the above match. To check who manages which project, open Projects → **Project Manager**.

### T14 – Reliability: nothing is lost while the workflow is off

1. In n8n, switch the workflow **inactive**.
2. Send a new invoice email to the +costs address. It stays **unread** in Gmail.
3. Switch the workflow **active** again.

**Pass if:**

- [ ] Within about a minute the email is processed and the cost appears, because the trigger reads all *unread* mail sent to +costs.
- [ ] Re-sending an already-processed invoice never creates a second row (see T2).

### T15 – Loop protection

**Do:** forward one of the `[DEMO] …` notification emails to the +costs address. Also try **replying** to one with "Re:".

**Pass if:**

- [ ] No new cost row is created and no existing row changes. The workflow ignores its own notifications and replies to them.
- [ ] In n8n the run is green and shows **Any Documents?** going to the *false* branch.

### T16 – A credit note never overwrites the invoice it corrects (edge `e22`)

**Do:** send a PDF titled **CREDIT NOTE** with `Credit Note No: CN-2290`, `Applies to Invoice: AT-INV-55120`, `Job: OAK-001`, `Total Credit: -$450.00`. Or run `npm run scenarios -- --suite edge e02 e22`.

**Pass if:**

- [ ] A **new** row is created with Document Ref **CN-2290** and Amount **−450**
- [ ] The invoice **AT-INV-55120** is unchanged: amount 3,980, Submission Count 1
- [ ] The credit note is flagged "Zero or negative amount (credit note?)", so a person can match it to the invoice
- [ ] The Apex – Oct 2026 summary is reduced by 450

### T17 – Clean up

```bash
npm run reset:demo     # moves the test records to the Notion trash and recalculates the summaries
npm run verify         # must end with "All consistent"
```

- [ ] The Apex – Oct 2026 row is back to the baseline from §1.4.

---

## 3. How to judge that the feature is complete

Tick each requirement once its test has passed:

| # | Requirement (from the assessment) | Proven by |
|---|---|---|
| 1 | Process incoming emails and attached receipts/invoices | T1, T6 (no attachment), T7 (photo), T9 (several attachments), T14 (real inbox) |
| 2 | Extract supplier, document reference, date, amount, currency, payment status | T1, T3, T6, T10 |
| 3 | Link each cost **and its supporting document** to the correct project | T1 (code + PDF in *Document*), T6 (keyword), T11 (PO number), T5 (no match → flagged) |
| 4 | Track paid/unpaid costs, including payment due dates | T1 (Net 30 → due date), T3 (Unpaid → Paid), T5 (overdue) |
| 5 | Handle duplicates and updates without double counting | T2, T3, T4, T8, T12, T16 |
| 6 | Flag submissions needing clarification or review | T4, T5, T6, T7, T8, T10 + the "Needs review" view |
| 7 | Notify the appropriate person when a cost is recorded or needs attention | T1, T5, T13 (and no email for T2) |
| 8 | Update Supplier Monthly Summary with total paid and unpaid per supplier per month | T1, T3, T10 (per currency), T12 (hand check) |
| 9 | Works on free plans | Notion Free + self-hosted n8n Community Edition; files ≤ 5 MB |
| 10 | Reliable / demonstrable | T14, T15, T17, n8n **Executions** history, `npm run verify` |

**The feature is complete when every row above has at least one passed test, and T12 matches by hand.**

---

## 4. What a human should *expect* to still do (by design)

These are not failures. The automation hands them to a person on purpose (README §9):

- **Photos and scanned PDFs:** open the attached file and type in the amount, date and reference (T7).
- **Flagged items:** work through the **Needs review** view, correct the fields, then untick *Needs Review*.
- **New suppliers:** add them to **Contacts** (Type = Supplier, with their invoicing email). After that they're recognised automatically.
- **Unusual layouts:** if a supplier's invoices are often flagged "Amount not found", ask them to include a "Total" line, or add their wording to the rules. A marked spot for AI extraction exists in the workflow.

---

## 5. If something doesn't pass

| What you see | Check |
|---|---|
| No new run in n8n Executions | Is the workflow **Active**? Did the email go to **samisiam851+costs@gmail.com** and is it **unread**? Is the IMAP node enabled? |
| Run is red (error) | Click the red node to read the error. Usually Notion access (page not shared with the integration) or credentials |
| No notification email | The **Send Notification Email** node is disabled until Gmail is set up (README §5.4); the run result says "email node disabled" |
| Wrong project | Put the project code (e.g. `RIV-001`) in the subject; check the project's **Project Code** in Notion |
| Totals look wrong | Run `npm run verify`; it lists every mismatch |
