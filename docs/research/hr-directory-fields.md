# What SMB HR suites put in a people directory, and who sees it

Written 2026-10-25 for fenro task T-468, a research ticket on the map T-466 "Employee records and
people directory". The question: which profile fields eight SMB HR suites ship, how they tier
visibility, who may edit what, how they hold people who never sign in and external workers, and what
happens to a profile when the employment ends. Every URL in [Sources](#sources) was read, or tried
and refused, on that date. Where a vendor's help centre refused the fetch or sat behind a login and
only a search snippet answered, the claim is marked **unverified**. Pricing and the module matrix
are in [`hr-suite-roadmap.md`](hr-suite-roadmap.md) and are not repeated here.

Short version: every suite splits the profile into a small directory card that every colleague
sees (name, photo, job title, department, location, manager, work email and phone) and a private
part that only the person and HR or admins see (date of birth, home address, personal contact,
emergency contact, national ID, bank details, salary). Managers sit in between and see their
reports, with the scope (direct, indirect, team, legal entity, whole company) set per role. The
larger suites (HiBob, Personio, Factorial, BambooHR) assign each section or field a view and edit
right per role; the smaller ones (Breathe, Timetastic) ship fixed roles with on/off toggles. Edits
by the person themself go live directly for low-stakes fields and through an approval step for
fields HR or payroll depends on, where the vendor offers one. External workers are almost always
the same record with a type flag (contractor, external, freelance contract), not a separate
directory; Factorial alone has a separate "external user" with no profile, for bookkeepers and the
like. Ending an employment is two acts everywhere: record the end date and reason, and cut access.
The profile stays, hidden from colleagues and visible to admins, until someone deletes it on
purpose.

| What                                      | State on 2026-10-25                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Vendors read                              | HiBob, Personio, Factorial, BambooHR, Breathe, Sesame, Timetastic, Calamari               |
| Help centres read in full                 | Factorial, Breathe, Sesame, Timetastic, Calamari                                          |
| Help centres refused (403 or login)       | HiBob, Personio, BambooHR; their developer docs were read instead                         |
| Vendors with a separate external record   | Factorial ("external users", no profile); Breathe's one HR Advisor seat                   |
| Vendors with a contractor flag            | Breathe, BambooHR, Personio, Sesame                                                       |
| Vendors that allow a person with no login | all eight; Timetastic and Personio need no email for it                                   |
| Vendors that hard-delete from the app     | Breathe, Sesame, Timetastic, Calamari; BambooHR clears fields; Factorial only via support |

## Default profile fields

What each vendor ships before any custom field. "Directory" is what a colleague with no special
role sees; "Profile" is the rest of the record. Sensitive fields are the ones the vendor itself walls
off from colleagues (marked by the vendor, not by this note).

| Vendor     | Directory (every colleague)                                                                                                                                   | Profile beyond the directory                                                                                                                                                                                 | Fields the vendor treats as sensitive                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HiBob      | not stated on any page read                                                                                                                                   | categories Basic info (`root`), Work, Personal, Address, Identification, Financial, Lifecycle, Employment, Payroll tables (salary, variable pay, bank accounts, equity, dependents, right to work, training) | SSN and full date of birth, hard-coded to need View and Edit; Personal category holds birthday, email, address                                                  |
| Personio   | the Public profile section: preferred name, position, workplace, department, supervisor (unverified)                                                          | admin-defined profile sections of attributes; the API exposes name, preferred name, gender, email, photo, position, office, department, team, supervisor, working hours, probation, start and end dates      | Personio advises keeping only non-sensitive details in Public profile (unverified); no fixed sensitive list found                                               |
| Factorial  | not stated; the "See Org chart" and "See preferred name" permissions decide what colleagues see                                                               | Personal tab: name, preferred name, pronouns, date of birth, legal gender, nationality, phone, communications email, ID type and number and expiry, address, emergency contact, bank, payroll (IRPF)         | the whole Personal tab sits behind "See personal info"; company identifier and seniority date have their own permissions                                        |
| BambooHR   | name, preferred name, job title, department, division, location, supervisor, work email, work and mobile phone, pronouns, social links, photo                 | personal, job, compensation, benefits, education, visas, passport, assets, dependents, emergency contacts, EEO and ethnicity, termination fields                                                             | the directory "never includes compensation, national identifiers such as SSN, birth date, home address, home contact details, or employment status and history" |
| Breathe    | name, job title, department, division, location, work email, extension, LinkedIn, Twitter, Skype, and first aider, fire warden, key holder, H&S officer flags | known-as name, pronouns, director flag, contract type, notice period, probation date, join date, gender, date of birth, marital status, nationality, NI number, address, driving licence, bank, salary, EDI  | the Personal tab ("salary, sensitive info") is seen only by the person and HR or admin; bank details can be hidden from line managers                           |
| Sesame     | none: other employees "will only be able to see if the rest of the team is active or not"                                                                     | Personal data (name, ID type and number, nationality, date of birth, address, email, phone, SSN); Work data (job title, department, managers, contribution group, professional category, bank account)       | no separate class; every data point gets a view or edit right per role                                                                                          |
| Timetastic | none: users have no Users menu; the wallchart shows every colleague's name and whether they are off                                                           | name, department, allowance, work schedule, photo; Pro adds job title, address, phone numbers, emergency contact, payroll ID                                                                                 | no class; colleague leave reasons are private by default                                                                                                        |
| Calamari   | "basic contact and organization structure info", work anniversaries, and birthdays with "day/month" only                                                      | email, name, hire date, position, teams, direct manager, contract type, work schedule, holiday calendar, approval flow, time zone, address; everything else is custom fields                                 | custom fields carry their own per-role visibility; Calamari's examples put ID and passport numbers, salary and bank account there                               |

Three things recur. The directory card is short and fixed by the vendor, never built field by field
by the customer (BambooHR and Breathe document theirs exactly). Date of birth is split from
birthday: BambooHR derives a month-and-day `birthday` from `dateOfBirth`, and Calamari shows
colleagues the day and month only. And the payroll fields (national ID, bank, tax) sit on the same
profile in every suite that sells to payroll, which the map already rules out for Flexi Day.

## Visibility tiers

| Vendor     | Everyone                                                         | Manager                                                                                   | HR or admin                                                                                          | Self                                                             | How a field gets its tier                                                                                                                                         |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HiBob      | through permission groups                                        | permission groups scoped to reports                                                       | Admins see everything and cannot be restricted (community); Limited Admin groups exist               | an "All people, own data" permission group (community)           | per category, now per field with the category as the default; each group has a people scope ("Access data for", filterable by lifecycle status) and a data scope  |
| Personio   | the Public profile section (unverified)                          | role with scope "direct reports" (unverified)                                             | Administrator role sets up roles and permissions (unverified)                                        | preset All employees role, own data, propose rights (unverified) | per profile section: View, Propose or Edit, each with an access scope (own, direct reports, all); an attribute inherits its section's rights (unverified)         |
| Factorial  | "Default employees" permission group                             | Manager, Team leader, Time-off supervisor roles; permissions scoped to reportees or teams | Administrators group, full power                                                                     | "For themselves" scope                                           | per permission, with a scope: themselves, direct and indirect reportees, teams they lead, their legal entity, whole company; plus a group Visibility tab          |
| BambooHR   | the Company Directory, a fixed fieldset shared per access level  | Manager access level: direct, or direct and indirect, reports (unverified)                | Full Admin, uneditable; Account Owner; Payroll Admin; custom levels (unverified)                     | Employee access level, own record only (unverified)              | per field per access level: No access, View only, Edit, Edit with approval (unverified); access levels add up when a user holds several (unverified)              |
| Breathe    | the Directory, fixed list, on or off                             | Line manager: direct reports, optionally one more tier; Holiday approver: leave only      | one Admin; HR users; Finance users (salary, bank); HR plus Finance is a "super user"; one HR Advisor | Employee: own information only                                   | fixed roles; toggles in "Change what people can see and do"; "you are not able to create new" permissions                                                         |
| Sesame     | only whether a colleague is active                               | Specific roles (Manager, Department, Workplace admin) over the people they manage         | General roles (Owner, General Administrator, HR Administrator) see and edit all data                 | the employee's own profile, editable unless blocked              | per role, per data point: view or edit, in three groups (Personal data, Work data, Custom fields)                                                                 |
| Timetastic | names and absence on the wallchart                               | department managers and approvers: their department's users and allowances                | Admins see and do everything; Directors read everything                                              | own allowance and calendar                                       | fixed roles plus three company privacy modes: leave types private or public, calendar view, department privacy                                                    |
| Calamari   | the employee list and custom fields set to "entire organization" | Direct manager, Team manager; Company manager sees the whole company                      | Administrators, any number                                                                           | "owner" of the profile                                           | system fields fixed; each custom field picks readers and editors from entire organization, owner, direct supervisor, team manager, company manager, administrator |

The pattern is two axes, stated outright by Factorial and HiBob: **who** the viewer may see (self,
reports, team, entity, everyone) and **which fields** of those people. Everyone else encodes the same
two axes in roles. The tier is attached to a section or category of fields, rarely to one field:
Personio, HiBob (until its field-level model), Factorial and Sesame all grant by section, and a new
field inherits its section's rights. HiBob and Factorial default new custom fields to hidden from
everyone but admins.

Two details matter for a small product. Breathe keeps "HR" and "Finance" apart on bigger plans so
that someone can run people admin without seeing pay. And BambooHR serves the directory through its
own setting rather than per-record permissions, so a plain employee reads the whole directory while
being unable to open any colleague's record.

## Edit rights and approval of own edits

| Vendor     | What the person may edit                                                                                                                    | Approval of own edits                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HiBob      | whatever the "own data" group grants                                                                                                        | People data update flows carry approvers and notifiers; the six default flows (email, reports to, start date, department, job title) cannot (community)                                    |
| Personio   | sections where the role has Propose or Edit                                                                                                 | Propose submits for approval; Edit applies directly. Workflows match submissions by priority; one that matches none is approved automatically (unverified)                                 |
| Factorial  | Personal details (general, ID, address, emergency contact, bank, payroll); in Work details only personal email, custom fields, face picture | none described; "every time you fill a field, click on Submit"                                                                                                                             |
| BambooHR   | per field                                                                                                                                   | "Edit with approval" per field: the change waits for approvers set under Information Updates, the field shows a pencil icon until they act, and any approver's denial ends it (unverified) |
| Breathe    | own EDI fields and, where allowed, own bank details; not custom fields                                                                      | none found; a bank details change emails every HR user with the time, time zone and IP address of the request                                                                              |
| Sesame     | My profile, unless blocked                                                                                                                  | turn on "Block editing of the 'My profile' section", pick which fields may be requested, pick the approval flow (default: the direct manager). "Requests do not support partial approvals" |
| Timetastic | phone number, address, emergency contact                                                                                                    | none; job title, payroll ID and work schedule are admin and department manager only                                                                                                        |
| Calamari   | custom fields configured as editable by the owner; photo, password, preferences                                                             | no field approval; employees file "Employee Requests" (forms such as personal data change or bank account update) that go to an assignee who updates the record by hand                    |

Who edits what follows the visibility tiers: admins edit everything, managers edit what their role
grants on their reports, and the person edits their own contact and personal fields. Fields that
other modules depend on (email, manager, job title, start date, department, site) are admin-only or
run through a dedicated flow in every suite. Email is the most guarded: Calamari lets only an
administrator change it, Breathe needs a super user on its larger plans, Factorial a separate "Edit profile email"
permission, HiBob a default flow.

Approval is per field at BambooHR and Sesame, and per role at Personio, where a 2022 community
answer says approval cannot be limited to chosen fields (unverified, and possibly dated). Breathe,
Timetastic and Factorial have no approval step for own edits at all.

## People who never sign in, and external workers

| Vendor     | A record without a login                                                                             | Email required                                           | External workers                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HiBob      | yes: creating an employee and inviting them are separate calls; access can be revoked on its own     | yes, plus first name, surname, site, start date          | not found on any page read                                                                                                                                                                                        |
| Personio   | yes: the profile records an "email invite status" (unverified)                                       | no: only first and last name are required                | Employment `type` is `INTERNAL` or `EXTERNAL`; external profiles count toward headcount and plan (unverified). One Person can hold several Employments sharing one email                                          |
| Factorial  | yes: profiles sit in a "not invited" box until invited; invitations last 7 days                      | for import, name, surname and email                      | "External users" are a separate kind: "not registered as employees", "won't have an employee profile", cost nothing, cannot clock in or request time off, but can approve and view through a permission group     |
| BambooHR   | yes: self-service is enabled per employee, and needs a work or home email (unverified)               | only for self-service (unverified)                       | `employmentStatus` is a list such as "Contractor", "Full-Time", "Part-Time", "Terminated", or custom                                                                                                              |
| Breathe    | yes, but every person must have a unique email; HR blocks login by editing it                        | yes                                                      | "Person type" is Employee, Contractor or Volunteer, fixed, counted toward the plan, and still needs a working pattern and an allowance (0 for contractors). The HR Advisor is a separate seat that is not counted |
| Sesame     | yes: the invitation is optional at creation; tablet clock-in codes need no account                   | yes for manual creation                                  | a contract type: "Freelance/Self-employed: for external collaborators who are not direct employees"                                                                                                               |
| Timetastic | yes: "all other fields are optional" besides name and allowance; managers book leave on their behalf | no, except for managers, approvers, admins and directors | none found                                                                                                                                                                                                        |
| Calamari   | yes: invitation is a separate step, valid 14 days                                                    | yes, unique, the import key                              | none as a type; a contract type is required on every profile and drives the leave policy                                                                                                                          |

Two models, then. People the company employs, with or without a login, are one record type with a
type field: contractor and volunteer at Breathe, employment status at BambooHR, internal or external
employment at Personio, a contract type at Sesame. People who only use the system (a bookkeeper, an
outside HR adviser) get a user without a profile at Factorial and an uncounted seat at Breathe. No
vendor read keeps contractors in a separate directory.

Login is never what makes someone a person in the directory. Every suite lets an admin create a
profile and invite later, or never. Timetastic and Personio go further and accept a person with no
email at all.

## Ended employment

| Vendor     | Ending                                                                                                                                                                           | Access                                                                                        | Profile afterwards                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HiBob      | terminate with a date; lifecycle entries (employed, leave, garden leave, terminated) take effect at midnight in the site's time zone                                             | revoked on termination, or immediately if chosen                                              | `internal.status` becomes Inactive; search excludes inactive people unless asked, and a permission group must be allowed to reach terminated people; deletion is a separate event                                                                            |
| Personio   | Employment status `INACTIVE`; a termination with date, last working day, notice date, a type from a fixed list (resignation, retirement, contract expired and more) and a reason | not documented in the API                                                                     | the Person turns `INACTIVE` when its latest Employment does; seeing inactive people in lists needs View on the section holding Status (unverified)                                                                                                           |
| Factorial  | Terminate employee: access end date and contract end date, a reason from a fixed per-country list, reassignment of pending approvals                                             | access and contract end are separate; an ended fixed-term contract keeps access until revoked | "See Former Employees" and "See Terminated Employees Info" are their own permissions; reactivation is possible; deletion only through a support ticket                                                                                                       |
| BambooHR   | employment status "Terminated" with date, type, reason, regrettable, rehire eligibility                                                                                          | inactive people cannot log in (unverified)                                                    | the directory excludes inactive and former employees; the record goes read-only after 30 days (90 with benefits, 1 year with payroll); admins can clear chosen fields from up to 10 former employees at once, protected fields excluded                      |
| Breathe    | status Pending, Current, Leaving, Left; a leave date and reason are required                                                                                                     | blocked on the leave date                                                                     | salary, benefit and job records close; reports are reassigned; the work email is removed (since 9 April 2024); hidden from the People list but searchable; only the Admin purges data, per person and per area; a whole profile can be deleted from its page |
| Sesame     | terminate the contract with a legal reason (separate from the account)                                                                                                           | deactivate the user                                                                           | deactivated profiles keep all data, free the licence, and show under "Show deactivated"; deleting is irreversible, and recovery costs $29.99                                                                                                                 |
| Timetastic | archive with an end date, now or scheduled                                                                                                                                       | ends at archive                                                                               | leave data kept, shown under the Leavers filter; delete removes everything, after offering a full export                                                                                                                                                     |
| Calamari   | set the termination date, cancel later requests, archive                                                                                                                         | "Archiving an employee is equivalent to terminating their system access"                      | only administrators see archived data, "managers can only see active users in reports"; restorable; deletion is permanent; archived people cost nothing                                                                                                      |

The end of a job and the end of access are separate acts at every vendor, and four of them
(Factorial, HiBob, Breathe, Timetastic) let the end lie in the future. A former employee drops out of the
colleague-facing directory everywhere and stays visible to admins, with Factorial and HiBob making
"former employees" its own permission. Retention is the customer's choice: Breathe suggests six
years and offers a per-area purge, BambooHR locks the record read-only and offers a field clear,
the rest offer whole-profile deletion. A rejoiner reopens the old profile at Breathe ("there is no
need to create a new profile") and at Calamari and Sesame (reactivate), while Personio models a
second Employment under the same Person.

## What this means for Flexi Day

- The directory card in every suite is what Flexi Day's groups and Employments already hint at:
  name, photo, job title, department, location, manager, work email and phone. A fixed card is the
  norm; per-field visibility comes with custom fields, which the map leaves out.
- Three of the four tiers already exist in the attendance visibility table
  (`flexi-day-be/docs/attendance.md:229`): Employee sees their own, Group admin sees their group's
  members, Org admin sees everyone. The directory adds a fourth, "every colleague", for the card.
- The glossary's **Birthday** (month and day, optional year, shared by choice) is exactly the
  colleague-facing half of the date-of-birth split that BambooHR and Calamari draw. A full date of
  birth, if kept, belongs in the HR-only tier.
- An Employment today needs a user account: `employments.user_id` is `NOT NULL` and unique per
  organization (`flexi-day-be/src/db/schema/employment-schema.ts:27,42`). Every vendor read holds
  people who never sign in, so T-470 and T-471 have to break that link or add a profile record that
  does not need one.
- The same unique key keeps only the current spell, so a rejoin overwrites the earlier one
  (`employment-schema.ts:12-15`). Personio's Person with several Employments is the model that keeps
  both; Breathe and Calamari reuse one profile.
- A type field on the record (employee, contractor) is the common answer for external workers. A
  separate login-only user, as at Factorial, only matters if outside advisers need access.

## Open questions for the map

1. Does the directory need an "every colleague" tier at all on the Free plan, or is it the card
   behind the plan gate (T-475)? Sesame and Timetastic show colleagues almost nothing.
2. Should HR and pay stay separate tiers, as Breathe splits HR from Finance, given payroll fields
   are out of scope? If no pay field is stored, one HR tier may be enough.
3. Approval of own edits: per field (BambooHR, Sesame), per role (Personio), or none (Breathe,
   Timetastic, Factorial)? An approval flow is the one piece here Flexi Day has no equivalent for
   outside bookings.
4. Is a group's manager the profile's "manager" line, or is the manager a separate field as at every
   vendor read? This is the map's existing "Not yet specified" item, and the vendors all keep one
   manager per person separate from approvers.
5. What does a contractor or a person without login do in leave and attendance? Breathe still makes
   contractors carry an allowance (zero), and Factorial's external users cannot clock in.
6. Who may see former employees: only the Org admin (Calamari), or a permission of its own
   (Factorial, HiBob)? And does a former employee's profile go read-only after a grace period, as at
   BambooHR?
7. Rejoin: one profile reused, or a new Employment under the same person (Personio)? The current
   unique key forces the first and loses the earlier spell.

## Sources

Read 2026-10-25 unless marked otherwise.

Flexi Day code: `flexi-day-be` at commit `7188856`, cited inline.

HiBob (help centre refused, developer docs and the vendor's own community read):

- Explore employee data API, <https://apidocs.hibob.com/docs/explore-employee-data.md>
- Categories and permissions, <https://apidocs.hibob.com/docs/categories-and-permissions.md>
- Field-level permissions, <https://apidocs.hibob.com/docs/employee-data-api-field-level-permissions>
- People read API contract (showInactive), <https://apidocs.hibob.com/docs/people-read-api-contract.md>
- Create employee, <https://apidocs.hibob.com/reference/post_people.md>; terminate,
  <https://apidocs.hibob.com/reference/post_employees-identifier-terminate.md>; revoke access,
  <https://apidocs.hibob.com/reference/post_employees-identifier-uninvite.md>; invite,
  <https://apidocs.hibob.com/reference/post_employees-employeeid-invitations.md>; lifecycle,
  <https://apidocs.hibob.com/reference/get_people-id-lifecycle.md>
- Heartcore community, people data update flows,
  <https://heartcorehr.hibob.com/tasks-flows-170/making-bob-your-single-source-of-truth-people-data-update-flows-4315>
- Heartcore community, default flows,
  <https://heartcorehr.hibob.com/tasks-flows-170/set-up-notifications-and-approvers-for-default-flows-like-change-site-6390>
- Heartcore community, admin permissions,
  <https://heartcorehr.hibob.com/employee-profile-and-fields-185/admin-permissions-control-1031>

Personio (help centre refused, developer docs read):

- Retrieve a person, <https://developer.personio.de/reference/get_v2-persons-id.md>
- Retrieve an employment, <https://developer.personio.de/reference/get_v2-persons-person-id-employments-id.md>
- Create a person and employment, <https://developer.personio.de/reference/post_v2-persons.md>

Factorial help centre:

- Short guide to permissions, <https://help.factorialhr.com/en_US/permission-groups-levels/short-guide-to-permissions>
- Employee permissions, <https://help.factorialhr.com/en_US/organisation/employee-permissions>
- About external users, <https://help.factorialhr.com/en_US/permission-groups-levels/about-external-users>
- About the Administrator role, <https://help.factorialhr.com/en_US/permission-groups-levels/about-the-administrator-role>
- Roles within the platform, <https://help.factorialhr.com/en_US/teams-jobs-organizational-chart/what-are-the-different-roles-within-the-platform>
- About custom fields, <https://help.factorialhr.com/en_US/managing-my-company-account/about-custom-fields>
- How to add employees, <https://help.factorialhr.com/en_US/managing-my-company-account/how-to-create-an-employee>
- How to edit employee information, <https://help.factorialhr.com/en_US/managing-my-company-account/how-to-edit-employee-information>
- Complete my personal profile, <https://help.factorialhr.com/en_US/managing-my-employee-profile/how-to-complete-my-personal-employee-profile>
- Employee invitations, <https://help.factorialhr.com/en_US/answers-to-common-questions/how-to-send-and-manage-employee-invitations>
- About terminated employees, <https://help.factorialhr.com/en_US/contracts-terminations/about-terminated-employees>
- Contract end dates and access, <https://help.factorialhr.com/en_US/contracts-terminations/understanding-contract-end-dates-and-platform-access>
- Delete an employee, <https://help.factorialhr.com/en_US/contracts-terminations/delete-an-employee>

BambooHR (help centre behind a login, developer docs and product updates read):

- Field names, <https://documentation.bamboohr.com/docs/list-of-field-names>
- Get employees directory, <https://documentation.bamboohr.com/reference/get-employees-directory>
- Terminated employee record management, <https://www.bamboohr.com/product-updates/terminated-employee-record-management>
- Clear terminated employee data, <https://www.bamboohr.com/product-updates/clear-terminated-employee-data>

Breathe knowledge base (`https://intercom.help/breathehr/en/articles/` plus the slug):

- `2096921-directory`, `2089510-user-permissions`, `5785087-what-permissions-do-hr-super-users-have`,
  `5785142-line-manager-permissions`, `5785190-what-permissions-do-admin-users-have`,
  `11011038-the-differences-between-an-hr-and-an-hr-advisor-permission-in-breathe`,
  `4150387-what-your-people-can-see-in-breathe`, `2096906-the-employee-profile`,
  `3515455-understanding-your-people-s-type`, `11710814-employee-record-changes-report`,
  `2494892-change-logs`, `8340027-equality-diversity-inclusion-edi-fields`,
  `2159523-where-are-bank-details-are-kept`, `6076131-editing-bank-details`,
  `3349902-custom-fields-and-what-they-mean`, `4351213-line-manager-user-guide`,
  `2285108-how-to-mark-your-people-as-left`, `3557747-people-that-are-leaving-pending-leavers`,
  `9027562-saving-a-left-employee-s-email-address`, `2361929-how-to-purge-your-people-data`,
  `4104165-re-using-a-profile-for-an-ex-employee`

Sesame knowledge base (`https://help.sesamehr.com/en_US/` plus the path):

- `roles/manage-access-to-employee-data`, `roles/what-is-data-privacy-for`,
  `roles/default-data-privacy-settings`, `roles/default-general-roles`,
  `roles/default-specific-roles`, `roles/types-of-roles-and-their-characteristics`,
  `who-can-see-employee-data`, `configurar-perfil-de-sesame`, `como-crear-empleados`,
  `employee-management/how-can-i-invite-employees-to-sesame`,
  `employee-management/can-employees-request-a-change-to-their-personal-data`,
  `employee-management/what-contract-types-can-i-create-in-sesame`,
  `employee-management/what-does-it-mean-to-deactivate-an-employee-and-how-can-i-do-it`,
  `employee-management/how-do-i-view-deactivated-employees`, `excluir-usuarios-de-minha-conta`,
  `como-rescindir-um-contrato`
- Employee profile (Spanish), <https://help.sesamehr.com/en/what-information-is-available-to-consult-in-the-employees-profile>

Timetastic help centre (`https://help.timetastic.co.uk/en/articles/` plus the slug):

- `13193403-access-privacy-who-can-see-what`, `13777212-what-can-employees-see-in-timetastic`,
  `13193419-hr-fields`, `13193413-timetastic-pro-an-introduction`, `13193341-timetastic-adding-users`,
  `13193380-timetastic-can-i-add-users-without-an-email-address`,
  `13193349-timetastic-users-delete-archive-removing`, `13193345-timetastic-add-a-profile-photo`

Calamari help centre (`https://help.calamari.io/en/articles/` plus the slug) and product page:

- `43849-core-hr-people-explained`, `58537-user-roles-in-calamari`,
  `171705-custom-fields-how-to-configure-them-and-examples-of-use`,
  `24557-how-can-i-add-a-regular-employee`, `24564-how-to-invite-an-employee`,
  `24458-how-to-import-or-update-employees-to-calamari`,
  `692776-employee-requests-how-they-work-and-how-to-configure-them`,
  `380134-audit-of-profile-changes-explained`, `24581-how-can-i-archive-an-employee`,
  `24503-how-can-i-check-archived-employee-s-data`, `24530-how-to-reactivate-an-archived-employee`
- Core HR product page, <https://www.calamari.io/hrms-employee-database>

Tried and refused, so claims that rely on them come from search snippets and are marked unverified:

- HiBob help centre, <https://help.hibob.com/hc/en-us> and
  <https://help.hibob.com/hc/en-us/articles/4409776355857-Employee-lifecycle-status> (403); HiBob
  product page <https://www.hibob.com/platform/core/> answered but holds nothing on fields or
  permissions
- Personio help centre, <https://support.personio.de/hc/en-us/articles/36539231813661>,
  <https://support.personio.de/hc/en-us/articles/360000038205-Permissions>,
  <https://support.personio.de/hc/en-us/articles/21453114449053-Set-up-employee-data-change-approval-workflows>
  (403); Personio community answer on field-specific approval,
  <https://community.personio.com/employee-roles-approvals-88/approval-of-specific-fields-by-specific-people-1055>
  (snippet only)
- BambooHR help centre, <https://help.bamboohr.com/> (renders client-side) and
  <https://bamboohr.screenstepslive.com/m/53910/l/587873-create-an-employee-access-level>,
  <https://bamboohr.screenstepslive.com/m/61968/l/639584-employee-access-manual>,
  <https://bamboohr.screenstepslive.com/m/53910/l/587372-access-level-types> (login page)
