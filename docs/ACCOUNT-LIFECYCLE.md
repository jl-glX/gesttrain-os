# Account lifecycle foundation

This document describes the technical foundation used to demonstrate account
identity, closure and data-retention flows. It is not a legal policy and does
not define production retention periods.

## Scope of the demo

The current implementation can demonstrate:

- a stable internal account identifier that is never shown as a credential;
- a public support identifier that can be shown, copied and rotated;
- an optional user-selected inactivity period;
- a guided review where the user can select particular data categories without
  closing the account;
- a reversible account-closure request with a 30-day grace period;
- cancellation of a scheduled closure;
- administrator-created retention-policy drafts;
- internal extension points for retained records, legal holds and future
  deletion candidates.

The demo deliberately does not:

- delete or anonymize user data;
- suspend account access when a closure is scheduled;
- send real email notifications;
- activate retention policies;
- decide which law applies to a user or a record;
- claim that a retention duration or legal basis is valid;
- replace professional legal review.

## Data review before account closure

The inactivity preference remains on the account-lifecycle screen. Manual data
and account actions begin from a single **Delete my data and account** entry
point so that a user can review the consequences before choosing an action.

The review screen offers two distinct intentions:

- select one or more data categories and save a data-deletion request draft
  without closing the account;
- schedule closure of the complete account using the existing 30-day grace
  period.

Saving a selective request does not delete data. It records the categories and
the user's intention so a future verified request workflow can evaluate
ownership, dependencies, applicable retention rules and execution results.

The screen also explains that some records may need to remain restricted for a
legal or operational reason. This is intentionally general: the demo does not
state final legal bases, jurisdictions or retention periods.

## Separation of identifiers

An account has two different identifiers:

| Identifier          | Purpose                                                        | Lifecycle                   |
| ------------------- | -------------------------------------------------------------- | --------------------------- |
| Internal account ID | Database relationships and audit continuity                    | Immutable and not public    |
| Public support ID   | Help the user identify the account to authorized support staff | Can be revoked and replaced |

A public support ID is an alias, not a password, session token or proof of
ownership. Rotating it must not change the internal account ID or break
historical audit relationships.

## Account closure states

The current closure request uses a deliberately small state model:

```text
active account
  -> closure scheduled
  -> 30-day grace period
  -> future execution boundary

closure scheduled
  -> user cancels
  -> active account
```

The future execution boundary has no implementation yet. A production design
must separately decide what is deleted, anonymized, retained under restriction
or blocked from ordinary use.

Only an authenticated action by the account owner should cancel a scheduled
closure. Merely opening an email link or receiving an automated request must
not count as proof of control.

## Inactivity preference

The user may choose an inactivity period or disable automatic scheduling. The
current demo stores the preference and the latest meaningful activity. It does
not run a background job that schedules or executes deletion.

Before enabling that automation, define and test:

- which user actions reset the inactivity timer;
- which server-side jobs must not reset it;
- warning channels and delivery failures;
- recovery during the grace period;
- active subscriptions, disputes and other closure blockers;
- accessibility and support-assisted recovery.

## Retention policy drafts

An administrator can create a policy with:

- a descriptive name;
- a jurisdiction label;
- a data category;
- an optional draft duration;
- an optional reference that still requires review.

Every policy created by the demo remains in `draft`. The interface has no
activation control and reports that execution is disabled.

The server contains narrow internal helpers for future work:

- register a record only against an active, reviewed policy;
- place or remove a legal hold;
- find expired records that are not on hold.

These helpers exist to make future responsibilities visible and testable. They
are not connected to an automatic deletion worker.

## Module collaboration

Account closure and retention remain separate modules because they answer
different questions, but they are not isolated:

- the lifecycle service asks the retention service for a disposition preview;
- the data-review screen presents closure choices and data classification
  together;
- active policies, draft policies and unclassified categories produce
  different review states;
- linked retention records can be counted without exposing their contents;
- both modules keep execution disabled until the future review and executor
  exist.

This boundary prevents closure scheduling from containing legal-policy logic,
while still giving the user and future operators one coherent workflow.

## Future execution contract

A later implementation should keep decision-making and execution separate:

```text
reviewed policy
  -> classify record
  -> calculate review date
  -> evaluate blockers and legal hold
  -> create auditable action proposal
  -> authorized execution
  -> record outcome
```

The executor should be idempotent, produce an audit trail, tolerate partial
failures and never infer legal rules from a country code alone.

## Documentation still pending

Before a public or commercial release, the legal notice, privacy policy and
terms of use must be updated together with the final product behaviour. That
future review must cover at least:

- purposes and lawful bases for each data category;
- final retention criteria and applicable jurisdictions;
- account closure, recovery, restriction and deletion behaviour;
- data retained for legal obligations or claims;
- processors, recipients and international transfers;
- user rights and verified request channels;
- consequences for invoices, security logs and active disputes;
- revision dates, change notices and renewed consent where required.

Do not copy the illustrative durations from the demo into legal documents
without a separate legal and operational review.
