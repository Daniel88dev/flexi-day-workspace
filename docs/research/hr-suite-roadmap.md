# From leave tracker to HR tool: what to build next

Written 2026-10-18 in answer to the owner's question "what kind of features could we develop for
our app next?", with the goal of growing Flexi Day into a full HR tool. Every URL in
[Sources](#sources) was read, or tried and refused, on that date. Facts about Flexi Day come from
the code in the four repos on that date, cited by file and line. Vendor facts come from each
vendor's own pricing, product or developer pages. Where a page refused the fetch and only a search
snippet or a third party had the answer, the claim is marked **unverified**.

Short version: Flexi Day already owns the two data sets every HR suite starts from, absences and
attendance, but it stops at the point where an employer has to hand those records to someone else.
The attendance module has no export, no overtime or night-work figures and no monthly sign-off,
while Czech law (§ 96 of the Labour Code) and the CJEU's 2019 Deutsche Bank ruling both expect an
employer to keep and produce exactly that record. Build that first. Then deepen leave the way Czech
and EU rules count it (pro-rata for joiners, carry-over limits, leave in hours, time off in lieu
from the attendance balance), add a people directory with HR fields, and put Flexi Day where people
already talk (Slack, Teams, a public API). Documents and onboarding checklists come after the
directory, reusing the attachment pipeline. Do not build payroll, recruiting, learning, expenses or
compensation yet. Every SMB suite read here either sells those as add-ons or hands payroll to a
local provider, and none of them extends data Flexi Day already holds.

| What                           | State on 2026-10-18                                                      |
| ------------------------------ | ------------------------------------------------------------------------ |
| Flexi Day plans                | Free, Pro €8/month, Enterprise €16/month, flat per organization          |
| Competitor pricing model       | Per employee per month at every vendor read, except Breathe (per band)   |
| EU Pay Transparency deadline   | 7 June 2026, passed; Czech law still in draft (unverified status)        |
| CJEU C-55/18                   | 14 May 2019; daily working time must be measured                         |
| Czech Labour Code version read | zakonyprolidi.cz, version 63, in force 29.08.2026 to 31.12.2026          |
| Vendor pages read              | 10 vendors; Personio only through its API docs                           |
| Pages refused (429/403)        | Personio pricing and help centre, Gusto (all pages), EUR-Lex (all texts) |

## What Flexi Day has today

Four repos, one product. The backend owns the domain vocabulary
(`flexi-day-be/GLOSSARY.md`); the web app, the iPhone app and the email templates borrow it.

### Leave (bookings)

- A booking is one `vacation` row per user, group and day, with optional `start_time`/`end_time`
  and a `half_day` flag (`flexi-day-be/src/db/schema/vacation-schema.ts:32-79`). A multi-day request
  is many rows sharing a `request_id`.
- Nine calendar record types: Vacation, Home office, Sick, Sick day, Paid time off, Non-paid leave,
  Study leave, Bank holiday, Other (`flexi-day-be/docs/calendar-record-types.md:25-35`). Only
  Vacation, Home office and Sick day draw down an allowance (`calendar-record-types.md:14-19`).
- Allowances are whole days per user, group and year: `vacation_days`, `home_office_days`,
  `sick_days`, `carried_over_days`, all `integer`
  (`flexi-day-be/src/db/schema/user-year-quotas-schema.ts:24-32`). A yearly job rolls unused
  vacation into the next year (`flexi-day-be/src/jobs/quotaRolloverJob.ts`). Nothing pro-rates an
  allowance for someone who joins or leaves mid-year; a search for pro-rata or accrual logic in the
  backend finds only billing code.
- Approval: each group has a manager, a main and a temp approver
  (`flexi-day-be/src/db/schema/group-schema.ts:21-25`), and members can hold approver access
  (`group-users-schema.ts:16-19`). Approve, reject, cancel and comment, single and bulk, run through
  one transition sequence that writes an append-only `vacation_events` row and then notifies
  (`flexi-day-be/GLOSSARY.md`, "Vacation workflow"). The flow is fixed: one approval step, no
  multi-step or conditional routing.
- Public holidays come from the group's `holiday_country` and skip booking days
  (`group-schema.ts:18-20`, `flexi-day-be/src/services/workingDays/workingDaysServices.ts:31`).
- Sick day is a paid-plan benefit an org admin switches on
  (`flexi-day-be/src/services/billing/guards.ts:166`).
- Attachments (image or PDF) hang off a request, live in S3 behind a Lambda processor, and are swept
  twelve months after the request's last day (`flexi-day-be/src/db/schema/attachment-schema.ts:19-45`,
  `flexi-day-be/src/services/attachment/attachmentRetention.ts:11`). Paid plans only
  (`guards.ts:187`).

### Attendance

- Attendance belongs to an Employment, one per person per organization, with `started_at`,
  `ended_at` and an optional `required_minutes_per_day` override
  (`flexi-day-be/src/db/schema/employment-schema.ts:20-32`, ADR
  `flexi-day-be/docs/adr/0004-attendance-is-org-scoped-via-employment.md`).
- Sessions carry server-stamped start and end, business date, timezone, how they closed, whether they
  were entered after the fact, and optional location fixes
  (`flexi-day-be/src/db/schema/attendance-schema.ts:58-86`). Breaks and an append-only event log sit
  beside them (`attendance-schema.ts:112-128`, `:179`).
- Organization settings: timezone, holiday country, working days, break allowance and threshold,
  required minutes per day, balance mode (daily or monthly), session and break ceilings, and a
  self-service window (`flexi-day-be/src/db/schema/organization-attendance-settings-schema.ts:45-92`).
- Worked time is presence minus the larger of the break allowance and breaks taken; the balance is
  shown against required time and "nothing is enforced", month-end balances neither carry over nor
  reset (`flexi-day-be/docs/attendance.md:41-66`).
- Endpoints: current state, month, day, team, clock in/out, breaks, entered sessions, corrections,
  event history (`flexi-day-be/src/routes/attendanceRouter.ts:101-1172`). There is no export route
  and the Excel builder knows nothing about attendance (`flexi-day-be/src/services/report/` has no
  reference to it).
- No overtime, night-work or standby classification exists. "Shift" is reserved in the glossary for
  a future feature (`flexi-day-be/GLOSSARY.md`, row "Attendance session").
- Active only on Pro or Enterprise; a lapse lets a person clock out but not in
  (`flexi-day-be/docs/attendance.md:203-212`, `guards.ts:327`).

### People and organization

- The `user` row holds name, email, verified flag, 2FA flag and image, nothing else
  (`flexi-day-be/src/db/schema/auth-schema.ts:11-19`). No job title, department, phone, address,
  contract type, emergency contact or manager line exists anywhere.
- An organization has a name, owner, billing email, Paddle customer and the Sick day toggle
  (`flexi-day-be/src/db/schema/organization-schema.ts:14-29`). The owner can delegate org admins
  (`organization-users-schema.ts:24-38`).
- Groups are the only structure: a group has a manager and members with view, admin and approver
  flags (`group-users-schema.ts:16-19`). There is no department tree or reporting line apart from
  "manager of a group".
- Birthdays (month, day, optional year, shared opt-in) are their own table
  (`flexi-day-be/src/db/schema/user-birthday-schema.ts:10-25`) and show only where a paid plan
  covers a group (`flexi-day-be/src/services/birthday/birthdayVisibility.ts:32`).
- Group events, one-off or recurring, live on a group's calendar
  (`flexi-day-be/src/db/schema/group-event-schema.ts:46-82`); creating one needs a paid plan
  (`guards.ts:373`).

### Reporting, calendars, notifications

- Reports: scope, overview, per-member, and an Excel export with a Summary and a Detail sheet
  (`flexi-day-be/src/routes/reportRouter.ts:81,133,180,255`,
  `flexi-day-be/src/services/report/excelBuilder.ts:63,85`). No plan guard on any of them.
- Calendar: a free `.ics` feed, and on paid plans a direct sync into Google or Microsoft calendars
  (`flexi-day-be/docs/calendar-direct-sync.md:1-7`,
  `flexi-day-be/src/db/schema/calendar-connection-schema.ts:10-13`,
  `flexi-day-be/src/services/calendarConnection/entitlement.ts:13`). Apple has no direct sync; it
  takes the `.ics` feed.
- In-app notifications have six types: approval requested, approval decided, calendar conflict,
  balance low, comment, session auto-closed (`flexi-day-be/src/db/schema/notification-schema.ts:5-12`).
  They push to the iPhone through APNs (`flexi-day-be/src/services/push/apnsHttp2Sender.ts`).
- Email templates cover account mail, the group invite, subscription grace and the four leave
  outcomes plus comments (`flexi-day-emails/emails/*.tsx`, ten files).
- No public API, no webhooks for customers, no Slack or Teams integration, no SAML or SCIM.
  Sign-in is password with optional 2FA (`flexi-day-be/src/utils/auth.ts:326`) or social sign-in
  through Google, Microsoft or Apple (`flexi-day-be/docs/social-sign-in.md`).
- GDPR tooling: self-service account deletion (`flexi-day-be/docs/account-deletion.md`) and
  retention sweeps for attachments and location fixes (`flexi-day-be/src/jobs/`). No self-service
  "download my data".
- Languages: English and Czech (`flexi-day-be/src/db/schema/user-settings-schema.ts:26-29`).

### Clients and plans

- Web pages: dashboard, requests, groups, report, my attendance, team attendance, organization,
  billing, calendar sync, settings, support (`flexi-day/app/(app)/*/page.tsx`).
- iPhone app: dashboard, requests and new request, groups and join, report, my attendance with
  entries and sessions, clock sheet, notifications, settings with 2FA and account deletion
  (`flexi-day-rn/src/app/`).
- Plan limits: Free 3 groups of 10, Pro 5 of 25, Enterprise 20 of 100, extra group slots on paid
  plans (`flexi-day-be/src/services/billing/entitlements.ts:8-12`). Prices are €8 and €16 a month
  (`flexi-day/lib/billing/prices.ts:15-21`), per organization, not per person.
- The pricing cards list attachments, birthdays and group events for Pro
  (`flexi-day/lib/i18n/dictionaries/en.ts:1797-1808`) but not attendance or calendar direct sync,
  both of which are paid-only in code. The public page undersells what Pro buys.

## What SMB HR suites sell

Read off each vendor's own pricing or product page. Cell values:

- **base** means the module is in every plan or in the core package.
- A plan name means it starts on that plan.
- **add-on** means it is sold separately on top of a plan.
- **listed** means the page names the module but not its plan.
- **no** means the pages read do not mention it. That is not proof the vendor lacks it.
- **(u)** marks a value taken from a search snippet because the vendor page refused the fetch.

Gusto is left out of the matrix. Every gusto.com page returned 403, and the only plan details found
came from third-party reviews. It is a US payroll company first, so it matters little for an EU
roadmap anyway.

| Module                      | Personio¹        | BambooHR²       | HiBob³ | Factorial⁴ | Deel HR⁵ | Rippling⁶   | Sesame⁷            | Kenjo⁸                 | Breathe⁹     | Timetastic¹⁰      | Calamari¹¹      | Flexi Day           |
| --------------------------- | ---------------- | --------------- | ------ | ---------- | -------- | ----------- | ------------------ | ---------------------- | ------------ | ----------------- | --------------- | ------------------- |
| Employee records, directory | Core (u)         | base            | base   | base       | Core     | HRIS module | base               | listed                 | base         | R&TC custom field | Core HR module  | no                  |
| Org chart                   | no               | no              | base   | no         | Core     | no          | base               | no                     | no           | no                | no              | no                  |
| Documents and e-signature   | Core, limits (u) | base (in onb.)  | base   | base       | no       | no          | base, e-sign extra | Starter; e-sign Growth | base         | R&TC              | Core HR module  | request files, paid |
| Onboarding, offboarding     | no               | base            | base   | base       | no       | no          | base               | Growth                 | base (tasks) | R&TC              | no              | no                  |
| Time off                    | Core (u)         | base            | base   | add-on     | Core     | no          | Essential          | listed                 | base         | Business          | Time Off module | Free                |
| Time tracking, attendance   | Core (u)         | add-on          | add-on | add-on     | no       | module      | Essential          | listed                 | add-on       | R&TC              | T&A module      | Pro                 |
| Shift scheduling, rota      | no               | add-on          | no     | add-on     | no       | module      | Essential          | Starter                | add-on       | R&TC              | module          | no                  |
| Payroll, native             | separate app (u) | add-on, US only | US, UK | no         | listed   | module      | listed             | no                     | no           | no                | no              | no                  |
| Payroll prep or export      | Core (u)         | no              | add-on | listed     | no       | n/a         | no                 | Starter                | base         | R&TC              | days report     | leave Excel, Free   |
| Expenses                    | no               | no              | no     | add-on     | no       | module      | listed             | no                     | add-on       | no                | no              | no                  |
| Performance, goals, 1:1s    | no               | Pro             | add-on | add-on     | Advanced | module      | Growth             | Starter                | base         | no                | module          | no                  |
| Surveys, eNPS               | no               | base            | listed | add-on     | Advanced | module      | no                 | no                     | above Micro  | R&TC              | no              | no                  |
| Recruiting, ATS             | API only         | base (5 jobs)   | add-on | add-on     | add-on   | module      | Connect            | add-on                 | add-on       | no                | no              | no                  |
| Learning                    | no               | base (1 course) | add-on | add-on     | Advanced | module      | listed             | Connect                | add-on       | no                | no              | no                  |
| Compensation                | API only         | Elite           | add-on | no         | Elite    | no          | no                 | no                     | no           | no                | no              | no                  |
| Assets, IT                  | no               | no              | no     | add-on     | no       | module      | no                 | no                     | no           | R&TC equipment    | no              | no                  |
| Reporting, analytics        | Core (u)         | base            | base   | no         | Core     | platform    | no                 | Starter; BI Growth     | base         | Business; Pro     | base            | Free                |
| Workflows, approvals        | Core (u)         | base            | base   | no         | Core     | platform    | no                 | Starter; adv. Growth   | base         | Business          | multi-step      | fixed one-step      |
| SSO (SAML)                  | no               | no              | no     | no         | no       | module      | Scale              | no                     | no           | Pro               | add-on          | no                  |
| Public API, webhooks        | yes, webhooks    | marketplace     | base   | listed     | no       | yes         | Scale or add-on    | Connect                | base         | no (u)            | yes, quotas     | no                  |
| Slack, Teams                | no               | no              | no     | no         | no       | no          | no                 | no                     | no           | Slack; Teams Pro  | yes             | no                  |
| Calendar integration        | no               | no              | no     | no         | no       | no          | no                 | no                     | no           | Google, Outlook   | Google, MS 365  | .ics; direct Pro    |

Sources per column, all read 2026-10-18:

1. Personio: tiers from a search snippet of `personio.com/pricing` (Core from €7.60 per employee per
   month, preliminary payroll in Core, Personio Payroll a separate app), **unverified** because the
   page returned 429 on six tries. API and webhook coverage from `developer.personio.de`, read.
2. BambooHR: `bamboohr.com/pricing`. Core, Pro, Elite; Payroll, Benefits Administration, Time and
   Attendance and Global Employment are add-ons, payroll and benefits US only.
3. HiBob: `hibob.com/pricing-plans-d` for the Core HR package and add-ons, `hibob.com/features`, and
   `hibob.com/features/payroll-hub` for payroll.
4. Factorial: `factorial.com/pricing` (Core in all plans, everything else a module) and
   `factorial.com/payroll-software`.
5. Deel: `deel.com/hr` for Core, Advanced, Elite; `deel.com/pricing` for recruiting, EOR and PEO.
6. Rippling: `rippling.com/pricing`. Modular; plans start at $8 per employee per month plus a base
   fee. The page does not list PTO, documents or onboarding.
7. Sesame: `sesamehr.com/pricing`. Essential, Connect, Growth, Scale, Custom.
8. Kenjo: `kenjo.io/pricing`. Starter, Growth, Connect. Some per-plan checkmarks did not render, so
   cells marked "listed" are on the page without a plan.
9. Breathe: `breathehr.com/en-gb/hr-software/hr-whats-included`. Priced per headcount band (Micro
   1-10 at £24 a month up to Plus 151-200 at £579), add-ons per band.
10. Timetastic: `timetastic.co.uk/pricing` and `timetastic.co.uk/features`. Business, Pro, Rota and
    Time Clock (R&TC). The API docs page rendered empty, so API is **unverified**.
11. Calamari: `calamari.io/pricing`. Modules priced per employee: Time Off, Time and Attendance, Core
    HR, Performance, Scheduling, SAML SSO. The page's own price figures conflict, so none are
    repeated here.

### What the matrix says

- Time off is the entry point for almost everyone, and it sits on the cheapest plan. Flexi Day is
  in the same place.
- Attendance is where vendors start charging. BambooHR, HiBob, Factorial and Breathe sell it as an
  add-on; Timetastic puts it on its top plan, next to rota, documents and onboarding. Flexi Day's
  Pro gating matches the market.
- The two leave-first competitors grew in the same order. Timetastic's top plan adds rota, time
  clock, timesheets, payroll export, documents, e-signature, onboarding and custom HR fields.
  Calamari added Time and Attendance, Core HR, Performance and Scheduling as separate modules. Both
  kept Slack and Teams on cheap plans.
- Core HR (records, documents, e-signature, onboarding) is in the base package at HiBob, Factorial,
  Sesame and Breathe. In a full suite it is not a premium feature, it is the floor.
- Talent modules (performance, surveys, recruiting, learning, compensation) are add-ons or upper
  tiers at every vendor that has them.
- SSO is an upper-tier or paid add-on everywhere it is priced (Timetastic Pro, Calamari add-on,
  Sesame Scale).
- Every vendor except Breathe prices per employee. Flexi Day prices per organization. Adding HR
  modules at a flat €8 a month leaves money on the table for a 25-person team; see open questions.

## Payroll

Payroll is country-specific: tax, social and health insurance contributions, filing formats and
deadlines differ per country. The vendors read here handle it three ways.

| Approach                          | Who, per their own pages                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native payroll in a few countries | BambooHR (US only, add-on); HiBob US Payroll and UK Payroll; Rippling Payroll and Global Payroll                                                                                                                                                                      |
| Prepare data, hand to a provider  | HiBob Payroll Hub pushes to ADP, Paylocity, TriNet, Xero and others; Personio preliminary payroll with a DATEV export for German companies (u); Factorial pitches "connect with your bookkeeper"; Kenjo "payroll management"; Breathe and Timetastic "payroll export" |
| Nothing                           | Calamari lists a payroll report of requested days and no export                                                                                                                                                                                                       |

Not one SMB tool read here calculates payroll natively outside its home market and one or two large
ones. A Czech payroll engine would mean tracking social and health insurance rules, the ČSSZ and
health insurer filings, and the yearly tax changes, for a single market. That is a different
company. What the market does sell at Flexi Day's size is the middle row: a clean monthly export of
absences and worked hours in the format the customer's payroll tool or accountant imports. Which
Czech payroll tools customers use is an open question below; no Czech payroll vendor's import
format was checked for this note.

## Regulatory pull in the EU and Czechia

### Recording working time

- **CJEU C-55/18, CCOO v Deutsche Bank, 14 May 2019.** Member States must require employers to set
  up an "objective, reliable and accessible system enabling the duration of time worked each day by
  each worker to be measured". The Member States decide the form, and may take account of sector and
  company size (CJEU press release 61/19). The judgment text on curia and EUR-Lex refused the fetch;
  the quote is from the Court's own press release.
- **Working Time Directive 2003/88/EC.** 48 hours a week on average including overtime, over a
  reference period of up to 4, 6 or 12 months; 11 hours of daily rest; 24 hours weekly rest; a break
  after 6 hours; 4 weeks of paid leave; night work averaging no more than 8 hours in 24 (European
  Commission summary page; EUR-Lex refused the fetch).
- **Czech Labour Code, Act 262/2006 Sb., § 96.** The employer keeps, for each employee, records of
  the start and end of shifts worked, overtime, night work and work during standby, plus the standby
  periods themselves. On request the employee may inspect that record and get copies at the
  employer's cost.
- **§ 93.** Ordered overtime is capped at 8 hours in a week and 150 hours a calendar year; beyond
  that it needs the employee's agreement; the average may not exceed 8 hours a week over up to 26
  weeks (52 with a collective agreement). Overtime taken as time off does not count toward that cap.
- **§ 79, § 88, § 90, § 92.** 40-hour standard week; a 30-minute break after at most 6 hours that is
  not working time; 11 hours daily rest; 24 hours weekly rest.

What this means for Flexi Day: the attendance module already records start and end per session
with server timestamps and an audit log, which is the hard part. It does not classify overtime,
night work or standby, does not check rest periods, and has no way to hand an employee or an
inspector a copy. Those are the gaps between "we track attendance" and "this is our § 96 record".

### Leave

- **§ 212-213.** At least 4 weeks a year (5 for public-sector employers listed in § 109(3), 8 for
  teachers). Entitlement equals weekly working time times the weeks of leave, so the law counts leave
  in hours. Pro-rata leave applies after 4 weeks of work in the year, at 1/52 per week worked.
- **§ 216-218.** Some absences, sick leave among them, count as work for leave purposes up to 20
  times weekly working time. The employer sets leave dates with 14 days' written notice. Leave above
  4 weeks may carry over on the employee's written request, and untaken leave must be taken by the end
  of the next year; if the employer has not scheduled it by 30 June, the employee may.
- **§ 192.** For the first 14 days of sickness the employer pays wage compensation at 60 % of average
  earnings.
- **§ 190a.** Remote-work costs are reimbursed at actual cost or at a flat rate per started hour of
  remote work set by ministry decree, unless the parties agree in writing that none is due.
- **Work-life Balance Directive (EU) 2019/1158.** 10 working days of paternity leave, 4 months of
  parental leave per parent with 2 non-transferable, 5 days of carers' leave a year, and a right to
  request flexible working for parents of children up to 8 and for carers (Commission summary page).

What this means for Flexi Day: allowances are whole days in `integer` columns
(`user-year-quotas-schema.ts:25-32`), so an employee on a 30-hour week or with hour-based leave
cannot be represented exactly; `half_day` and start/end times only cover part of it. There is no
pro-rata for joiners or leavers, though `employments.started_at` and `ended_at` already exist for
attendance. Carry-over is automatic and unconditional. Paternity, parental and carers' leave are not
record types; they would land in Other or Non-paid leave today. Home office days are booked but not
hours, so a § 190a flat-rate claim cannot be computed from Flexi Day data.

### Pay transparency

- **Directive (EU) 2023/970.** Transposition deadline 7 June 2026. Workers get pay information
  before employment and may ask for average pay levels by sex for equal work; employers may not ask
  about pay history; gender pay gap reporting applies to employers with at least 100 employees
  (European Commission equal pay page).
- The reporting phase-in, annual for 250+ and every three years for 150-249 from 7 June 2027, and for
  100-149 from 7 June 2031, comes from law-firm summaries only. **Unverified** against the Official
  Journal text, which EUR-Lex refused to serve.
- Czechia missed the deadline. MPSV published a "minimalist" draft amending the Labour Code (page
  title read; body did not render). Secondary sources say it is planned to take effect on 1 January
  2027, with reporting and the right to information from 1 January 2028, and that only the comment
  round had finished by 29 July 2026. **Unverified.**

What this means for Flexi Day: the directive is about pay, and Flexi Day stores none. Enterprise
caps a group at 100 people, and the reporting duty starts at 100 employees, so few current customers
fall under it. Pay transparency is a reason to build compensation later, not now.

### Employee data under GDPR

- Individuals have rights of access, rectification, erasure, restriction, portability and objection.
  An organization answers within one month, extendable by two months with notice; electronic
  requests get electronic answers; portability needs a structured, machine-readable format such as
  CSV or JSON, and a PDF is not enough (EDPB SME guide).
- Retention periods must be fixed per purpose and objectively justifiable (Article 5(1)(e), as
  summarised by the EDPB; the regulation text on EUR-Lex refused the fetch).

What this means for Flexi Day: the deletion flow and the twelve-month sweeps cover erasure and
retention for what exists today. Every new HR field (address, contract, documents) adds data an
employer must be able to export, correct and delete on a schedule. A per-person export and per-type
retention settings should ship with the directory, not after it.

## Gap analysis

Effort is my estimate for this codebase: **S** a few days in one or two repos, **M** one to three
weeks across backend and web (phone where it matters), **L** one to two months with new tables and
flows, **XL** a quarter or more, or work that depends on outside partners or legal expertise.

### Modules that extend data Flexi Day already holds

| Module                                | What it is                                                                                                             | Who needs it                      | Builds on                                                                     | Effort | Why that effort                                                                                                           | Regulatory pull                                  | Competitor tier                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Timesheet export and monthly sign-off | Excel/CSV of sessions, breaks, worked vs required time, flags, per person and team; employee and admin confirm a month | admin, employee (copy on request) | `attendance_sessions`, `attendance_breaks`, month endpoint, `excelBuilder.ts` | M      | Data and worked-time maths exist; needs an export route, a sheet layout and a sign-off row per Employment and month       | High: § 96(2) copies on request; C-55/18         | Timetastic R&TC, Calamari T&A, Kenjo, Breathe add-on               |
| Overtime, night work, rest checks     | Classify worked time into regular, overtime, night; warn on missed 11 h rest, 8 h/week and 150 h/year overtime         | admin, manager                    | Session instants and org timezone; balance mode                               | M      | Pure computation over existing rows plus a few org settings; no new capture flow                                          | High: § 93, § 96, WTD Art. 3-8                   | BambooHR T&A add-on (overtime), Timetastic R&TC                    |
| Time off in lieu (TOIL)               | Turn a positive attendance balance into bookable leave                                                                 | employee, approver                | Monthly balance, record types, quotas                                         | M      | New record type and a quota line fed from attendance; the balance today is display-only by design (`attendance.md:57-66`) | Medium: § 93(5) overtime taken as time off       | not seen on the pages read                                         |
| Leave policies v2                     | Pro-rata for joiners and leavers, carry-over limits and expiry, accruals, leave in hours                               | admin                             | `employments.started_at/ended_at`, rollover job, quotas                       | L      | Quotas are `integer` days per group; hours need a unit change in schema, sync pull, phone store and reports               | High in CZ: § 213 counts hours, § 218 carry-over | Timetastic Pro accruals; Calamari accrual and carry-over           |
| Absence types for EU family leave     | Paternity, parental, carers' leave as record types                                                                     | employee, admin                   | Record type enum                                                              | S      | Enum values plus copy; the enum rename path is documented (ADR 0002)                                                      | Medium: Directive 2019/1158                      | Timetastic lists maternity and paternity                           |
| Absence analytics                     | Trends per group, Bradford-style sickness score, who has not taken leave, burnout signals                              | admin, manager                    | `vacation` rows, report scope, overview endpoint                              | S-M    | Reads only; the report scope and visibility rules already exist                                                           | Low                                              | Timetastic Pro, BambooHR, Breathe (burnout monitor)                |
| People directory and org chart        | Profile per person with job title, department, manager, start date, contact; chart from groups and managers            | everyone; admin edits             | `user`, `employments`, `groups.manager_user_id`, birthdays                    | M      | New profile table keyed by Employment, permissions reuse the attendance visibility table                                  | Medium: GDPR access and retention for new fields | Base at HiBob, Factorial, Sesame, Breathe; Calamari Core HR        |
| Custom HR fields                      | Org-defined fields with sensitivity levels (e.g. salary visible to admins only)                                        | admin                             | Directory                                                                     | M      | Typed field definitions plus per-field visibility; worth doing with the directory, not before                             | Medium: GDPR minimisation                        | Timetastic R&TC; Calamari Core HR                                  |
| Documents and e-acknowledgement       | Company policies and per-person files; employee confirms reading                                                       | admin, employee                   | Attachment pipeline: S3, Lambda processor, retention sweep (ADR 0003)         | M      | Storage, scanning and retention exist for request files; needs an owner other than a request and an acknowledgement row   | Low                                              | Base at Factorial, HiBob, Breathe; Calamari Core HR                |
| Qualified e-signature                 | Legally binding signatures on contracts                                                                                | admin, employee                   | Documents                                                                     | L-XL   | Needs a trust service provider integration; eIDAS rules were not researched here                                          | unknown                                          | Sesame charges extra; Kenjo Growth                                 |
| Onboarding and offboarding checklists | Task lists triggered by an Employment starting or ending                                                               | admin, manager, new hire          | `employments`, invites, notifications                                         | M      | Template plus task tables; triggers already exist as Employment start and end                                             | Low                                              | Base at BambooHR, HiBob, Factorial, Sesame; Kenjo Growth           |
| Slack and Teams                       | Approve from chat, daily "who is off", clock in                                                                        | everyone                          | Notifier fan-out after commit (`vacationNotifier.ts`), notification types     | M      | One more channel beside email and push; OAuth app per platform and per-workspace install                                  | none                                             | Timetastic Business (Slack), Pro (Teams); Calamari                 |
| Public API and webhooks               | Read absences, attendance and people; events on approve and clock-out                                                  | admin, integrators                | OpenAPI JSDoc on every route, sync pull cursors                               | M-L    | Needs API keys scoped to an organization, rate limits and a stable versioned subset; webhooks need signing and retries    | Low; enables payroll handoff                     | HiBob, Breathe base; Personio has one; Sesame Scale; Kenjo Connect |
| SSO (SAML/OIDC) and SCIM              | Company sign-in and automatic joiner/leaver provisioning                                                               | IT admin                          | better-auth, organizations, Employment end                                    | M      | better-auth plugins exist (not verified for this version); SCIM must map onto groups and Employment                       | Low                                              | Timetastic Pro, Sesame Scale, Calamari add-on                      |
| Personal data export                  | One-click export of a person's records                                                                                 | employee, admin                   | Sync pull already gathers everything a user can see                           | S      | A serializer over existing reads                                                                                          | Medium: GDPR access and portability              | not listed by any vendor read                                      |

### Greenfield modules

| Module                         | What it is                                                       | Who needs it      | Builds on                                                          | Effort | Why that effort                                                                                         | Regulatory pull                                | Competitor tier                                 |
| ------------------------------ | ---------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Shift scheduling, rota         | Plan shifts, templates, swaps, coverage, link to leave and clock | manager, employee | Group working days, attendance sessions, the reserved word "shift" | L      | New planning model, conflict rules against bookings, publish flow, phone UI                             | Low                                            | add-on or top plan everywhere; Sesame Essential |
| Performance, goals, 1:1s       | Review cycles, questionnaires, goals                             | manager, employee | Groups as review lines                                             | L      | New forms engine, cycles, anonymity rules                                                               | none                                           | Pro/Advanced or add-on; Breathe base            |
| Surveys, eNPS                  | Pulse surveys with anonymous results                             | admin, employee   | Notifications, push                                                | M      | Small forms engine; anonymity thresholds need care                                                      | none                                           | BambooHR base; Deel Advanced; Factorial add-on  |
| Announcements                  | Company news feed                                                | admin, employee   | Notifications, group events                                        | S-M    | A post type on the existing notification and push path                                                  | none                                           | Timetastic R&TC news feed; Sesame Connect       |
| Expenses                       | Receipts, approval, export to accounting                         | employee, finance | Attachment pipeline, approval pattern                              | L      | OCR, currencies, VAT, accounting exports                                                                | Low                                            | add-on at Factorial, Breathe; Rippling module   |
| Asset management               | Who holds which laptop                                           | admin             | Directory                                                          | S-M    | A small inventory table, but few buyers ask a leave tool for it                                         | none                                           | Factorial add-on; Timetastic R&TC               |
| Recruiting, ATS                | Job posts, candidates, pipeline                                  | hiring manager    | nothing                                                            | XL     | Job boards, candidate GDPR consent, email parsing; a product of its own                                 | Low                                            | add-on almost everywhere                        |
| Learning                       | Courses and compliance training                                  | admin, employee   | nothing                                                            | XL     | Content is the product; Breathe only tracks training records in base                                    | Low                                            | add-on or upper tier                            |
| Compensation, pay transparency | Salary bands, history, gender pay gap report                     | admin, finance    | Directory, custom fields                                           | L      | Sensitive data, permission model, statistics; nothing in Flexi Day today holds pay                      | Rising: 2023/970, reporting from 100 employees | BambooHR Elite, Deel Elite, HiBob add-on        |
| Payroll, native                | Calculate and file Czech payroll                                 | finance           | Attendance and leave as inputs                                     | XL     | Country rules, filings and yearly changes; no SMB vendor read does this outside one or two home markets | High, but served by local payroll tools        | US/UK only at HiBob, US at BambooHR; Rippling   |
| Benefits administration        | Enrolment and carriers                                           | admin             | nothing                                                            | XL     | US-centric product at every vendor that sells it                                                        | none in CZ                                     | BambooHR add-on US only                         |

## Recommended sequence

The order favours modules that turn data Flexi Day already captures into something an employer is
obliged to produce, then the people record that every later module needs. Each step should be
sellable on its own.

0. **Fix the pricing cards (S, copy only).** Pro already includes attendance and calendar direct
   sync, and the cards do not say so (`en.ts:1797-1808`). Cheapest win on the list.

1. **Timesheets: export, overtime and monthly sign-off (M, then M).** Ship the attendance Excel and
   CSV export first: per person and per team, start and end of every session, breaks, worked and
   required time, flags. Then classify overtime and night work, show the § 93 caps, and add a
   month confirmation by employee and admin. This turns the existing clock into the § 96 record and
   the input every payroll provider asks for. It also answers the CJEU's "accessible" requirement.

2. **Leave policies that match Czech rules (S, then L).** Start with the cheap half: EU family leave
   record types and absence analytics on existing data. Then pro-rata entitlement from
   `employments.started_at/ended_at`, carry-over limits per § 218, and TOIL fed from the attendance
   balance. Leave in hours is the expensive part, because allowances are `integer` days through
   schema, sync pull, phone store and reports; decide it with customers before building (see open
   questions).

3. **People directory, profiles and org chart (M).** Job title, department, manager, start date,
   contact, custom fields with sensitivity levels, and a chart drawn from groups and managers. Ship a
   per-person data export with it. This is the base layer at HiBob, Factorial, Sesame and Breathe,
   and documents, onboarding and SSO provisioning all hang off it.

4. **Slack and Teams, then a public API with webhooks (M, M-L).** Timetastic and Calamari put chat
   integrations on cheap plans because that is where leave requests get noticed. The API is how a
   customer's payroll tool or accountant pulls step 1's data without a spreadsheet.

5. **Documents with acknowledgement, then onboarding and offboarding checklists (M, M).** Reuse the
   attachment pipeline for company and personal documents, then trigger checklists on Employment
   start and end. Leave qualified e-signature to a later decision.

6. **SSO and SCIM for Enterprise (M), when an Enterprise prospect asks.** Upper-tier everywhere it
   is priced, so it belongs on Enterprise and should wait for a buyer.

Defer or avoid:

- **Payroll calculation.** Avoid. Serve it through step 1's export and step 4's API instead, as
  HiBob, Personio and Breathe do outside their home markets.
- **Recruiting, learning, benefits.** Avoid for now. Each is a product with its own buyers, none uses
  data Flexi Day holds, and every vendor sells them as add-ons.
- **Compensation and pay transparency.** Defer until the directory exists and the Czech
  transposition is final. Few customers reach the 100-employee reporting threshold.
- **Shift scheduling.** Defer unless customers with hourly or shift staff ask. It would change who
  Flexi Day sells to, and it is the largest of the extend-existing items.
- **Performance and surveys.** Defer behind the directory. They are common, but they are talent
  products, not records, and every vendor tiers them up.
- **Expenses and assets.** Avoid. Low demand from a leave-tool buyer and an accounting tail.

## Open questions for the owner

1. **Pricing model.** Every competitor read charges per employee; Flexi Day charges €8 or €16 per
   organization. Do HR modules stay inside Pro and Enterprise, become paid add-ons, or move the
   whole product to per-seat pricing?
2. **Who is the customer?** Office teams with leave and home office, or employers with hourly and
   shift staff? The answer decides whether shift scheduling moves up and whether leave in hours is
   urgent.
3. **Which payroll tools and accountants do current customers use?** The export format in step 1
   should match what they import. No Czech payroll vendor's import format was checked here.
4. **Leave in hours.** Do Czech customers count leave in hours in practice, as § 213 does, or still
   in days? This decides whether step 2 needs the schema change.
5. **Country focus.** Is the market Czechia first, or the EU broadly? The § 96 and § 213 work is
   Czech-specific; the CJEU and WTD points apply everywhere.
6. **Sign-off as a legal record.** Should the monthly attendance confirmation be designed with a
   labour lawyer, so it can stand as the employer's § 96 record in an inspection?
7. **Data growth.** Directory and documents bring addresses, contracts and possibly health data
   into a product that today holds dates. Is the privacy policy and DPA ready for that, and who signs
   off on retention defaults?

## Facts later tickets depend on

- Allowances are `integer` days per user, group and year (`user-year-quotas-schema.ts:25-32`);
  bookings carry `half_day` and optional `start_time`/`end_time` (`vacation-schema.ts:49-57`).
- Employment has `started_at`, `ended_at`, `required_minutes_per_day`
  (`employment-schema.ts:30-32`), and is per organization, not per group (ADR 0004).
- Attendance sessions store server instants, business date and timezone
  (`attendance-schema.ts:65-72`); worked time is presence minus the larger of break allowance and
  breaks taken (`attendance.md:41-50`); the balance is presentation only (`attendance.md:57-66`).
- No attendance export exists; the Excel builder has a Summary and a Detail sheet for leave only
  (`excelBuilder.ts:63,85`).
- Paid-plan checks are read-time and lapse-safe (`guards.ts:166,187,327,373`,
  `entitlements.ts:65`); a new paid module should follow the same pattern.
- The `user` row has no HR fields (`auth-schema.ts:11-19`). Groups are the only structure.
- Notifications fan out after commit through one notifier; six types today
  (`notification-schema.ts:5-12`).
- Czech law: records of shift start and end, overtime, night work and standby (§ 96); overtime caps
  8 h a week and 150 h a year when ordered (§ 93); leave counted as weekly hours times weeks (§ 213);
  carry-over rules (§ 218).
- CJEU C-55/18: an "objective, reliable and accessible" daily working-time system.

## Sources

Read 2026-10-18 unless marked otherwise.

Flexi Day code: the four repos in this workspace at the state on that date, cited inline.

Vendors:

- BambooHR pricing, <https://www.bamboohr.com/pricing/>
- Breathe, what's included, <https://www.breathehr.com/en-gb/hr-software/hr-whats-included>
- Calamari pricing, <https://www.calamari.io/pricing>
- Deel HR, <https://www.deel.com/hr/>
- Deel pricing, <https://www.deel.com/pricing/>
- Factorial pricing, <https://factorial.com/pricing>
- Factorial payroll, <https://factorial.com/payroll-software>
- HiBob pricing, <https://www.hibob.com/pricing-plans-d/>
- HiBob features, <https://www.hibob.com/features/>
- HiBob Payroll Hub, <https://www.hibob.com/features/payroll-hub/>
- Kenjo pricing, <https://www.kenjo.io/pricing>
- Personio API docs, <https://developer.personio.de/>
- Rippling pricing, <https://www.rippling.com/pricing>
- Sesame HR pricing, <https://www.sesamehr.com/pricing/>
- Timetastic pricing, <https://timetastic.co.uk/pricing/>
- Timetastic features, <https://www.timetastic.co.uk/features/>

Tried and refused, so claims that rely on them are marked unverified:

- Personio pricing, <https://www.personio.com/pricing/> (429; tiers taken from a search snippet)
- Personio help centre, <https://support.personio.de/hc/en-us/articles/11149358090653-Overview-of-Personio-plans-and-apps>
  and the DATEV article <https://support.personio.de/hc/en-us/articles/360003166037-Monthly-Payroll-in-Personio-With-DATEV-Integration>
  (403; DATEV scope taken from search snippets)
- Gusto pricing and payroll, <https://gusto.com/product/pricing>, <https://gusto.com/product/payroll> (403)
- Timetastic API docs, <https://app.timetastic.co.uk/api-docs/> (rendered empty)

Law and regulators:

- CJEU press release 61/19, C-55/18, 14 May 2019,
  <https://curia.europa.eu/jcms/upload/docs/application/pdf/2019-05/cp190061en.pdf>
- European Commission, Working Time Directive,
  <https://employment-social-affairs.ec.europa.eu/policies-and-activities/rights-work/labour-law/working-conditions/working-time-directive_en>
- European Commission, Work-life balance,
  <https://employment-social-affairs.ec.europa.eu/policies-and-activities/rights-work/labour-law/working-conditions/work-life-balance_en>
- European Commission, EU action for equal pay,
  <https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/gender-equality/equal-pay/eu-action-equal-pay_en>
- EDPB SME guide, respect individuals' rights,
  <https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en>
- Czech Labour Code, Act 262/2006 Sb., version 63, <https://www.zakonyprolidi.cz/cs/2006-262>
  (§ 79, 88, 90, 92, 93, 96, 190a, 192, 211-218)
- MPSV press release on the pay transparency draft,
  <https://mpsv.gov.cz/ministerstvo-prace-predstavilo-minimalisticky-navrh-zakonu-o-odmenovani-a-platformove-praci>
  (title only; body did not render)

Refused by EUR-Lex or curia (bot check, empty body), so the official texts were not read directly:

- Directive (EU) 2023/970, <https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng>
- Directive 2003/88/EC, <https://eur-lex.europa.eu/eli/dir/2003/88/oj/eng>
- Judgment C-55/18, <https://curia.europa.eu/juris/liste.jsf?num=C-55/18>
- European Parliament position on 2023/970, <https://www.europarl.europa.eu/doceo/document/TA-9-2023-0067_EN.html>
- Council press release, 24 April 2023,
  <https://www.consilium.europa.eu/en/press/press-releases/2023/04/24/gender-pay-gap-council-adopts-new-rules-on-pay-transparency/>

Secondary sources used only for claims marked unverified: law-firm and consultancy summaries of the
2023/970 reporting phase-in returned by web search (Osborne Clarke, Grant Thornton Denmark,
Deutscher AnwaltSpiegel), and Czech press on the MPSV draft (ARROWS, praceamzda.cz, epravo.cz).
