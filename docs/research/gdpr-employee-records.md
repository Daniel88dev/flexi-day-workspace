# What GDPR and EU rules require of employee records

Written 2026-10-25 for fenro task T-467, a research ticket on map T-466 "Employee records and
people directory". The question: what GDPR and EU employment rules require of an employer's records
about its people, as they bear on a directory with fixed and sensitive HR fields (job title,
department, manager, start date, contract type, home address, private phone, emergency contact,
date of birth).

Every source in [Sources](#sources) was read on that date. The GDPR text was read in its
as-adopted form on legislation.gov.uk, because EUR-Lex again answered every fetch with an empty
body. National statutes were read as consolidated texts in force on that date. Where only a search
snippet or a law-firm summary had the answer, the claim is marked **unverified**. Readings of mine
that no source states outright are marked as such. None of this is legal advice; the owner's
privacy policy and DPA work stays out of scope, as the map says.

Short version: none of the nine fields is special-category data in itself, but two of them come
close. An emergency contact is a third person's data, and a relationship label on it can reveal
sexual orientation, which the CJEU treats as special-category processing. Consent is the wrong
basis for almost all of it; contract, legal obligation and legitimate interest carry the
directory. GDPR sets no retention numbers, while national law sets long ones for some of these
records: 45 years in Czechia for documents on the type, start and end of employment and for
working-time records, 10 years in Poland for the whole employee file. So an employee deleting their
Flexi Day account should not delete the employer's record, and today it does. The employer
is the controller of the HR record and answers access and portability requests; Flexi Day, as
processor, has to make that possible, with a structured export and a log of who read the sensitive
fields.

| What                                   | State on 2026-10-25                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Special category among the nine fields | None in itself; an emergency contact's relationship can be (CJEU C-184/20)             |
| Consent as a basis for employee data   | Exceptional only (EDPB Guidelines 05/2020, para. 21-22)                                |
| Access request deadline                | One month, plus two with notice (Art. 12(3))                                           |
| Portability                            | Contract or consent bases only, automated, structured format (Art. 20; WP242)          |
| Czech pension-record retention         | 45 calendar years after the year concerned (§ 35a(4)(c), Act 582/1991 Sb.)             |
| Polish employee file retention         | Employment plus 10 years from the end of the leaving year (Art. 94 pt 9b, Labour Code) |
| German payroll retention               | To the end of the year after the last social-insurance audit (§ 28f SGB IV)            |
| Access-log retention a DPA recommends  | Six months to a year (CNIL deliberation 2021-122, para. 8)                             |
| Flexi Day's privacy policy names it as | Data controller for everything it describes, team and organisation data included       |

## Lawful basis per field

GDPR Art. 6(1) lists six bases; four matter here. (b) contract, (c) legal obligation, (f)
legitimate interest, and (a) consent. Art. 88 lets Member States add more specific employment
rules, and the CJEU held in C-34/21 (30 March 2023) that a national rule which only repeats the
GDPR's own conditions is not "more specific" and must be disapplied. The Hessian DPA reads that as
reaching § 26(1) BDSG, which uses nearly the same words, and tells German employers to rely on
Art. 6(1) bases directly. A product that serves several countries should therefore map every field
to an Art. 6(1) basis and treat national employment-data rules as extra conditions on top.

Consent is a poor fit. The EDPB holds that employees can rarely refuse an employer freely, that
"for the majority of such data processing at work" consent "cannot and should not be" the basis,
and that it stays possible only where refusing carries no consequence at all (Guidelines 05/2020,
para. 21-22). WP29 Opinion 2/2017 on data processing at work says the same. Poland writes the
exception into law: Art. 22¹a of the Labour Code allows consent for data beyond the statutory list,
and a refusal or withdrawal may not lead to any detriment.

| Field             | Basis an employer would normally use                                                                                      | Country detail found                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Job title         | (b) contract; (f) for showing it to colleagues                                                                            | Slovakia, § 78(3) Act 18/2018: an employer may disclose or publish title, name, position, department, workplace, work phone and work email for the job |
| Department        | (b) / (f)                                                                                                                 | Same Slovak provision                                                                                                                                  |
| Manager           | (b) / (f)                                                                                                                 | Czechia, § 312(2) Labour Code: only superior managers may read an employee's personal file                                                             |
| Start date        | (b) and (c)                                                                                                               | Czechia keeps documents on the start, type and end of employment 45 years (§ 35a(4)(c), Act 582/1991)                                                  |
| Contract type     | (b) and (c)                                                                                                               | Same Czech provision                                                                                                                                   |
| Home address      | (c) where law asks for it, otherwise (b)                                                                                  | Poland, Art. 22¹ § 3: the employer requires the employee's residence address                                                                           |
| Private phone     | (f), supplied by the person                                                                                               | Poland, Art. 22¹ § 1 pt 3: "contact details indicated by" the person, so the person chooses them                                                       |
| Emergency contact | (f) for keeping it; (d) vital interests only at the moment of an emergency (recital 46)                                   | Czechia, § 316(4)(b): an employer may not require information on family circumstances. Poland: outside the Art. 22¹ list, so consent under Art. 22¹a   |
| Date of birth     | (c) where law asks for it (social insurance registration, Polish Art. 22¹ § 1 pt 2), otherwise not needed for a directory | Poland requires it from every candidate                                                                                                                |

The Polish emergency-contact entry is my reading of Art. 22¹ and 22¹a, not a UODO statement.

Two consequences for the field catalogue:

- Every optional field (private phone, emergency contact) has to be optional in fact: an employee
  who leaves it empty loses nothing. That is what makes (f) or Polish consent hold.
- Date of birth and Birthday are two purposes. Date of birth is an HR record kept for legal duties
  and seen by HR; Birthday is the user's own choice to share a day with their groups. The glossary's
  "Avoid: date of birth" stays right for Birthday. A date-of-birth field should never feed the
  Birthday display without the user's own opt-in.

## Special categories and the emergency contact

Art. 9(1) covers racial or ethnic origin, political opinions, religious or philosophical beliefs,
trade union membership, genetic data, biometric data for unique identification, health data, and
data on sex life or sexual orientation. None of the nine fields is one of those.

Three places in a directory get close:

- **The emergency contact's relationship.** In C-184/20 (1 August 2022) the Grand Chamber held that
  publishing data that can reveal sensitive information indirectly is processing of special
  categories; the case concerned a declarant's spouse, cohabitant or partner. A relationship field
  that says "husband" or "partner" on a profile can reveal sexual orientation the same way. The
  simplest safe design stores a name and a phone number and no relationship. That is my
  recommendation, not a regulator's.
- **Free-text fields.** A note such as "diabetic, insulin in desk" is health data under Art. 4(15).
  A fixed field model with no free-text note avoids it.
- **Sick day bookings.** Not a directory field, but already in Flexi Day. The fact that a person was
  off sick reveals information about their health status, which is the Art. 4(15) definition of
  health data. Art. 9(2)(b) allows it for employment-law obligations where Union or national law
  authorises it. The directory should not widen who sees sickness.

The emergency contact is a third person's personal data under Art. 4(1). What follows:

- The contact has rights of their own (access, rectification, erasure, objection to (f)).
- The data is not collected from the contact, so Art. 14 applies: the employer owes the contact
  the controller's identity, purpose and basis. Art. 14(5)(b) excuses this only where informing
  "proves impossible or would involve a disproportionate effort", which is hard to argue when the
  employer holds the contact's phone number.
- Consent from the employee cannot be the contact's basis; consent comes from the data subject. The
  Polish route is about the employee's own data in the employer's file.
- Recital 46 says vital interests of another person should in principle be used only where no other
  basis manifestly applies. Keeping the contact on file needs (f); calling them in an emergency can
  rest on (d).
- A Czech legal commentary says an objection by the employee or the contact can require deleting
  the contact before employment ends. **Unverified**, secondary.

## Retention after employment ends

GDPR sets no periods. Art. 5(1)(e) keeps data identifiable "for no longer than is necessary for the
purposes", and WP29 Opinion 2/2017 repeats it for the workplace. The periods come from national
labour, social insurance, tax and limitation law, and they differ per record type, not per person.
The examples below are examples, not rules for the product.

| Country  | Record                                                                                                                                                                                   | Period                                                                                                      | Source                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Czechia  | Wage sheets or accounting records for pension insurance, always including documents on type, start and end of employment, workplace injuries, and working-time records with unpaid leave | 45 calendar years after the year they concern; 10 years for old-age pensioners                              | § 35a(4)(c), Act 582/1991 Sb.                       |
| Czechia  | Personal file (§ 312)                                                                                                                                                                    | No period in the Labour Code; only documents "necessary" for the job may be in it                           | § 312(1) Labour Code                                |
| Czechia  | Working-time records (§ 96)                                                                                                                                                              | No period in § 96 itself; the 45-year pension rule above covers them                                        | § 96, § 35a(4)(c)                                   |
| Germany  | Books and records / accounting vouchers / other tax-relevant documents                                                                                                                   | 10 / 8 / 6 years                                                                                            | § 147(3) AO, § 257(4) HGB                           |
| Germany  | Payroll documents                                                                                                                                                                        | To the end of the calendar year after the last social-insurance audit                                       | § 28f(1) SGB IV                                     |
| Germany  | Overtime records; daily working time for minimum-wage-covered staff                                                                                                                      | At least 2 years                                                                                            | § 16(2) ArbZG, § 17(1) MiLoG                        |
| Germany  | General personnel file                                                                                                                                                                   | Commonly 3 years from the end of the leaving year, matching the regular limitation period                   | § 195, § 199(1) BGB; the practice is **unverified** |
| Poland   | Whole employee documentation and personal file                                                                                                                                           | Employment plus 10 years from the end of the calendar year it ended, unless a law says longer               | Art. 94 pt 9b Labour Code                           |
| Poland   | Files of people hired 1999-2018                                                                                                                                                          | 50 years unless the employer filed ZUS OSW and ZUS RIA reports                                              | Practitioner summaries, **unverified**              |
| Poland   | Civil-law contractors                                                                                                                                                                    | Contract term, then the limitation period for claims, then any legal duty                                   | UODO employer guide, section 5.1                    |
| Slovakia | Wage sheets and personal files                                                                                                                                                           | Commonly 50 years under registry plans of the Archives Act 395/2002; 10 years for social insurance evidence | Practitioner summaries, **unverified**              |

What this means for Flexi Day: the records that live longest are the ones Flexi Day already holds
or will hold, start and end of employment, contract type, attendance and unpaid leave. An employer
in Czechia is meant to keep them for decades, normally in its payroll system, not in Flexi Day. The
product does not have to be that archive, but it must not destroy the records before the employer
has exported them. Optional fields with no legal duty behind them (private phone, emergency
contact, Birthday) have no purpose once employment ends and should go at the end, or shortly
after. Retention has to be set per record type, by the employer as controller, with defaults.

## Erasure vs the duty to keep

Art. 17(1)(a) gives a right to erasure once data is no longer necessary. Art. 17(3) removes it to
the extent processing is necessary "for compliance with a legal obligation" (b) or "for the
establishment, exercise or defence of legal claims" (e). Art. 18 gives restriction, the middle
state: kept, but not used.

Who decides matters more than what:

- The employer is the controller of its HR records. EDPB Guidelines 07/2020 treat a provider of a
  standardised cloud service, even one on take-it-or-leave-it terms, as a processor where it stores
  data "solely on behalf of its customers". Their payroll example is the same shape.
- A processor acts "only on documented instructions from the controller" (Art. 28(3)(a)), and at
  the end of the service deletes or returns the data "at the choice of the controller"
  (Art. 28(3)(g)). A processor that deletes an employer's records because the employee clicked
  "delete account" acts outside its instructions.
- Today the account deletion flow hard-deletes the user's Employments with their attendance, and an
  owner's deletion takes former members' ended Employments with it
  (`flexi-day-be/docs/account-deletion.md`, "What goes and what stays"). The privacy policy says
  Flexi Day is "the data controller for the personal data described", team and organisation data
  included (`flexi-day/app/(legal)/privacy/page.tsx:19-24`).

What an employer may and must keep when someone deletes their account, as I read it:

- **Must keep:** what national law tells it to keep, for that law's period (the table above).
- **May keep:** what it needs for likely legal claims, for the limitation period.
- **Must delete or let go:** optional fields with no duty behind them, and the login identity
  itself, which is the user's relationship with Flexi Day, not with the employer.

The design consequence is a split between the user's account and the employer's record of the
Employment. Deleting the account ends sign-in and the user's own data; the Employment record,
reduced to what the employer must keep and restricted to admins, stays until the employer's
retention period or until the employer deletes it. That is task T-471's question.

## Access and portability

- **Who answers.** The employer, as controller. The processor assists "by appropriate technical and
  organisational measures, insofar as this is possible" (Art. 28(3)(e)). The EDPB says that
  assistance may be "promptly forwarding any request" or "enabling the controller to directly
  extract and manage the relevant personal data"; the controller stays responsible, and Chapter III
  deadlines are not extended because a processor is slow (Guidelines 07/2020, para. 130-132). Where
  Flexi Day is the controller (the login account), it answers itself.
- **Deadline.** Without undue delay and within one month of receipt; two more months where
  necessary, with the reasons given within the first month (Art. 12(3)). The EDPB's access
  guidelines say the one-month clock runs from receipt.
- **Scope.** Everything the controller processes about the person, including what its processors
  hold (EDPB Guidelines 01/2022, footnote 75). The requester gives no reasons; a former employee
  preparing an unfair-dismissal claim is still owed the answer (Example 1). The copy may not
  "adversely affect the rights and freedoms of others" (Art. 15(4)).
- **Format of access.** A copy, free the first time; where the request arrives electronically, "in
  a commonly used electronic form" (Art. 15(3)). A PDF can serve for access; the roadmap's
  reading of the EDPB SME guide is that it does not serve for portability.
- **Portability is narrower.** Art. 20 covers data the person "provided", processed by automated
  means on the basis of consent or contract, delivered "structured, commonly used and
  machine-readable". WP242 says in HR it "typically applies only if the processing is based on a
  contract", that data under legal obligation or legitimate interest falls outside, that observed
  data counts and inferred data does not, and names XML, JSON and CSV as suitable formats. Running
  portability on all of it anyway is described as good practice.
- **Access logs are in scope.** In C-579/21 (22 June 2023) the CJEU held that the dates and purposes
  of consultations of a person's data are information the person has the right to obtain. The
  identity of the employees who consulted it is not, unless it is essential for the person to
  exercise their rights, weighed against those employees' rights.
- **National extras.** Czech employees may inspect their personal file and working-time records
  and take copies at the employer's cost (§ 312(3), § 96(2) Labour Code).

What this means for Flexi Day: one per-person export, run by an org admin for one person, in JSON
or CSV, covering profile fields, leave, attendance and the read log's dates and purposes, answers
both access and portability. A self-service copy of the user's own profile would let the employer
point the employee at it. The export should leave other people's names out of the read log by
default.

## External workers vs employees

GDPR applies to every natural person; it draws no line between an employee and a freelancer. The
lines are drawn by national law:

- WP29 Opinion 2/2017 uses "employee" for every employment relationship "regardless of whether
  this relationship is based on an employment contract", freelancers included.
- § 26(8) BDSG counts "employee-like persons" (arbeitnehmerähnliche Personen) among employees.
- The Polish UODO guide (section 5.1) says no statute lists what may be collected from a civil-law
  contractor, so purpose limitation and minimisation decide. Their basis is the contract (6(1)(b))
  plus legal obligations such as health-insurance registration. A self-employed business partner is
  an equal party, so the power imbalance behind the consent rule is weaker.
- Retention for contractors follows the contract, the limitation period and tax law (invoices under
  § 147 AO and § 257 HGB in Germany), not labour-law file rules.
- Czech labour-law duties cover both employment contracts and the DPP/DPČ work agreements (§ 3,
  § 313 Labour Code); a trade-licence contractor is outside them.

What this means for Flexi Day: the same fields should not apply to both. Contract type, home
address and date of birth have a legal reason for an employee and usually none for a freelancer, so
the catalogue should mark which fields apply to which kind of worker. A contractor engaged through
their own company is a business contact; WP242 says portability does not cover professional
contact details in a business-to-business relationship. This is input to T-470.

## Logging access to sensitive fields

GDPR has no clause that says "log reads". The duty comes from Art. 32 (security "appropriate to the
risk", including "unauthorised disclosure of, or access to" data), Art. 5(1)(f) confidentiality,
and Art. 5(2) accountability: a controller has to be able to show who saw a home address.

What regulators expect:

- CNIL deliberation 2021-122 (14 October 2021) recommends logging creation, consultation,
  modification and deletion, each with the individually identified author, the timestamp, the
  nature of the operation and a reference to the data concerned, without copying the data itself
  into the log (para. 6). Logs should sit apart from the main system, write-only for the
  application, with access granted on strict need (para. 7), and be kept six months to a year
  (para. 8).
- C-579/21 makes the dates and purposes of reads part of what the person can ask for.
- Poland requires a written authorisation for anyone processing special-category employee data
  (Art. 22¹b § 3). Czechia limits who may read a personal file to superior managers and listed
  authorities (§ 312(2)).

What this means for Flexi Day: writes are already audited for leave (`changes`) and attendance
(attendance events). The directory needs a read log for the sensitive tier (home address, private
phone, emergency contact, date of birth): who, when, which person, which field group, and why
where the UI can ask. Keep it 6-12 months, separate from the record, and expose its dates and
purposes in the export. This is input to T-477.

## Facts later tickets depend on

- None of the nine fields is Art. 9 data in itself. An emergency contact's relationship can be
  (C-184/20); sick day bookings are health data under Art. 4(15).
- An emergency contact is a third person's data: basis (f), Art. 14 information duty, optional in
  Czechia (§ 316(4)(b)) and consent-based in Poland (Art. 22¹a, my reading).
- Consent is not a basis for mandatory employee fields (EDPB 05/2020, para. 21-22).
- Retention is per record type and set by the employer: Czech pension records 45 years
  (§ 35a(4)(c), Act 582/1991), Polish employee files 10 years after the leaving year (Art. 94
  pt 9b), German payroll to the year after the last audit (§ 28f SGB IV).
- The employer is the controller of HR records and Flexi Day the processor (EDPB 07/2020); the
  processor deletes on the controller's instruction (Art. 28(3)(a), (g)). Account deletion today
  hard-deletes Employments, which conflicts with this.
- Access: one month, plus two (Art. 12(3)); electronic copy (Art. 15(3)); dates and purposes of
  reads included (C-579/21). Portability: contract or consent data, JSON, CSV or XML (Art. 20,
  WP242).
- Read logging for sensitive fields: author, time, operation, data reference; 6-12 months; kept
  apart (CNIL 2021-122).
- Slovakia allows disclosing title, name, position, department, workplace, work phone and work
  email without consent where the job needs it (§ 78(3) Act 18/2018). That is a ready-made public
  tier for the directory.

## Open questions this raises

- Should deleting a user account keep the employer's Employment record (archived, restricted)
  instead of hard-deleting it? Which records survive, and who can erase them afterwards?
- Flexi Day's privacy policy names Flexi Day as controller of team and organisation data. Does the
  owner accept the processor role for directory data, with a DPA for organizations? This is the
  owner's legal work, but the product design depends on the answer.
- Does the emergency contact keep a relationship field? Dropping it avoids C-184/20.
- Who tells an emergency contact that their data is held (Art. 14): a notice the employee passes
  on, a text message from the product, or the employer outside the product?
- Should an org admin be able to export an Employment before its owner deletes the account, or
  before the organization is deleted?
- Does the read log ask for a purpose, or record only who and when?
- Does the visibility of sick day bookings need review once the directory widens who sees what?

## Sources

Read 2026-10-25.

Flexi Day code: the workspace repos on that date, cited inline.

GDPR, Regulation (EU) 2016/679, as adopted, on legislation.gov.uk (EUR-Lex returned empty bodies):

- Art. 4, <https://www.legislation.gov.uk/eur/2016/679/article/4/adopted>
- Art. 5, <https://www.legislation.gov.uk/eur/2016/679/article/5/adopted>
- Art. 6, <https://www.legislation.gov.uk/eur/2016/679/article/6/adopted>
- Art. 9, <https://www.legislation.gov.uk/eur/2016/679/article/9/adopted>
- Art. 12, <https://www.legislation.gov.uk/eur/2016/679/article/12/adopted>
- Art. 14, <https://www.legislation.gov.uk/eur/2016/679/article/14/adopted>
- Art. 15, <https://www.legislation.gov.uk/eur/2016/679/article/15/adopted>
- Art. 17, <https://www.legislation.gov.uk/eur/2016/679/article/17/adopted>
- Art. 20, <https://www.legislation.gov.uk/eur/2016/679/article/20/adopted>
- Art. 28, <https://www.legislation.gov.uk/eur/2016/679/article/28/adopted>
- Art. 30, <https://www.legislation.gov.uk/eur/2016/679/article/30/adopted>
- Art. 32, <https://www.legislation.gov.uk/eur/2016/679/article/32/adopted>
- Art. 88, <https://www.legislation.gov.uk/eur/2016/679/article/88/adopted>
- Recitals 46 and 155, <https://www.legislation.gov.uk/eur/2016/679/introduction/adopted>

EDPB and WP29:

- EDPB Guidelines 05/2020 on consent, v1.1,
  <https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf>
- EDPB Guidelines 01/2022 on the right of access, v2.0,
  <https://www.edpb.europa.eu/system/files/2023-04/edpb_guidelines_202201_data_subject_rights_access_v2_en.pdf>
- EDPB Guidelines 07/2020 on controller and processor, v2.1,
  <https://www.edpb.europa.eu/system/files/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf>
- EDPB Guidelines 1/2024 on legitimate interest,
  <https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf>
- WP29 Guidelines on data portability, WP242 rev.01,
  <https://ec.europa.eu/newsroom/article29/redirection/document/44099>
- WP29 Opinion 2/2017 on data processing at work, WP249,
  <https://ec.europa.eu/newsroom/article29/redirection/document/45631>

CJEU (judgment pages on curia render only through JavaScript, so the Court's press releases were
read):

- C-579/21 Pankki S, press release 107/23,
  <https://curia.europa.eu/jcms/upload/docs/application/pdf/2023-06/cp230107en.pdf>
- C-184/20 Vyriausioji tarnybinės etikos komisija, press release 133/22 (French; no English file
  was served), <https://curia.europa.eu/jcms/upload/docs/application/pdf/2022-08/cp220133fr.pdf>
- C-34/21 Hauptpersonalrat, read through the Hessian DPA's guidance below; the judgment and an
  English press release were not reached.

National authorities and law:

- Hessian DPA (HBDI), Handreichung zum EuGH-Urteil C-34/21, 25 April 2023,
  <https://www.datenschutz.hessen.de/sites/datenschutz.hessen.de/files/2023-05/handreichung_beschaeftigtendatenschutz_eugh-urteil.pdf>
- CNIL, délibération 2021-122 on logging,
  <https://www.cnil.fr/sites/cnil/files/atoms/files/recommandation_-_journalisation.pdf>
- UODO, Ochrona danych osobowych w miejscu pracy. Poradnik dla pracodawców, October 2018,
  <https://uodo.gov.pl/pl/file/1469>
- Polish Labour Code, consolidated text Dz.U. 2025 poz. 277 (Art. 22¹, 22¹a, 22¹b, 94),
  <https://api.sejm.gov.pl/eli/acts/DU/2025/277/text.pdf>
- Czech Labour Code, Act 262/2006 Sb. (§ 96, 312, 313, 316), <https://www.zakonyprolidi.cz/cs/2006-262>
- Czech Act 582/1991 Sb. on social security administration (§ 35a),
  <https://www.zakonyprolidi.cz/cs/1991-582>
- German BDSG § 26, <https://www.gesetze-im-internet.de/bdsg_2018/__26.html>
- German AO § 147, <https://www.gesetze-im-internet.de/ao_1977/__147.html>
- German HGB § 257, <https://www.gesetze-im-internet.de/hgb/__257.html>
- German SGB IV § 28f, <https://www.gesetze-im-internet.de/sgb_4/__28f.html>
- German ArbZG § 16, <https://www.gesetze-im-internet.de/arbzg/__16.html>
- German MiLoG § 17, <https://www.gesetze-im-internet.de/milog/__17.html>
- German BGB § 195 and § 199, <https://www.gesetze-im-internet.de/bgb/__195.html>,
  <https://www.gesetze-im-internet.de/bgb/__199.html>
- Slovak Act 18/2018 Z. z. on personal data protection (§ 78(3)),
  <https://www.zakonypreludi.sk/zz/2018-18>

Secondary sources used only for claims marked unverified: Czech legal commentary on emergency
contacts (pravniprostor.cz), Polish practitioner summaries of the 50-year transitional rule
(kadry.infor.pl, e-prawnik.pl), Slovak practitioner pages on wage-sheet retention (podnikajte.sk,
podnikam.sk), and law-firm summaries of C-34/21 and C-184/20 used to find the primary documents.
