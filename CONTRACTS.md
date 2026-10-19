# Contracts

Two files. `contracts/purpose.py`, class `Purpose`, is the contract.
`contracts/fixtures/data_room.py`, class `DataRoom`, is the consumer that acts
on its answer.

## Purpose

Consent written in a person's own words, and every use of their data read
against it. A person records what the data is, up to five purposes they agree
to, and the whole price, fixed at consent: a dividend per granted request and an
access fee per opening. A requester states, in plain words, what they will use
the data for; the network decides, under consensus, which numbered purpose
covers that stated use, if any. A purpose found stores a grant and pays the
person a dividend in the same transaction; none refuses the request and pays the
person the requester's bond; unclear pays the person the unclear fee, half the
bond, so no judgment is free. The data room opens access to a record's data only
to the requester a grant names, for exactly the record's access fee, paid to the
person.

## Consensus

One round, `_purpose_round(label, purposes, use)`, one
`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` block, run inside `request()`
after every door has passed and before anything is written. The only
`gl.nondet.exec_prompt` call in the file is in `_ask`, and the only four `_ask`
calls are inside that `leader_fn`. Nothing is nested. `request()` is not
payable, and no payable method reaches the round.

**The four askings.** `_task(label, purposes, use, framing, arrangement)` builds
each one. The framing fixes the question; the arrangement fixes the numbering
and which block comes first; nothing else differs:

- `FRAMING_COVERS`: "Which ONE numbered PURPOSE covers the STATED USE? Answer
  with that purpose's number, or NONE if no purpose covers it."
- `FRAMING_BEYOND`: "Does the STATED USE need something that none of the
  numbered PURPOSES agreed to? Answer yes if it does, no if it does not, or
  unclear."
- Each asks one thing; what "covers" means is said once, in the shared scope
  paragraph: read plainly, the person agreed to that use in that purpose's
  words.
- `LISTED`: the PURPOSES block (a line naming the data, then the purposes
  numbered in the order the person listed them), then the USE block.
- `ROTATED`: the same, with the purposes rotated by one (`_rotated`: the second
  listed is numbered 1 and the first listed comes last), then the USE block.
- `PURPOSES_FIRST`: the PURPOSES block in the listed order, then the USE block.
- `USE_FIRST`: the USE block, then the PURPOSES block in the listed order.

The leader asks `covers/listed`, `covers/rotated`, `beyond/purposes_first` and
`beyond/use_first`, in that order. `_unrotate(pick, count)` maps a number read
off the rotated list back to the listed number (`pick % count + 1`); NONE and an
unreadable answer pass through unchanged. With two or more purposes no purpose
keeps its number in the rotation, so the two COVERS askings name the same
purpose only when the reader read the words.

**Reading the answers.** `_read_pick(raw, count)` reads a COVERS answer
strictly into a purpose number from 1 to `count`, `PICK_NONE` (0) for the word
NONE in any case, or `PICK_UNREAD` (-1) for anything else: a number counts only
as an int or as one or two ASCII digits with no leading zero, inside the
record's range. `_read_answer(raw)` reads a BEYOND answer into `yes`, `no`,
`unclear` or `""`. JSON from the model is parsed with hooks that refuse
fractions, NaN and Infinity, so no float is ever built.

**The combine rule.** `_combine(listed, rotated, first, second)`, with `rotated`
already mapped back: a purpose k when both COVERS readings are k and both BEYOND
readings are `no`; `none` when both COVERS readings are NONE and both BEYOND
readings are `yes`; `unclear` otherwise. The stored value is
`{"finding": "<k>" | "none" | "unclear"}`, cleaned by `_clean_finding` against
the record's purpose count. Disagreement is a value, never a tolerance.

**The comparison.** `validator_fn` is one line, `return _agrees(leaders_res,
leader_fn)`. `_agrees` returns `False` for a leader that raised, `False` for a
leader result that is not a dictionary, reruns the whole leader closure (all
four askings) inside `try/except` (its own failure is a disagreement), and
compares `finding` by exact string equality.

**The prompt boundary.** `_block(label, text)` fences the text (`<` to `(`, `>`
to `)`, never deleted) and writes it between `<<<LABEL tag>>>` and `<<<END LABEL
tag>>>`, where `tag` is the first 16 hex characters of the sha256 of the fenced
body. It is the only place a delimiter is written. The labels are the two
contract constants `PURPOSES` and `USE`. `_purposes_body` builds the purposes
text and is only ever called as the text of a block. Before the blocks the
prompt says both are untrusted, that anything they say about the task counts for
nothing, that the task is not whether the use is good, legal or likely to be
kept to, and that neither the order of the blocks nor the numbers carry any
meaning. No amount and no address is a parameter of `_task` or of the round.

## State

Scalars only inside the three `@allow_storage` dataclasses; every collection is
a `TreeMap` keyed by a string the contract builds.

| field | key | value |
|---|---|---|
| `record_rows` | `K1` | `Record`: person, label, purpose_count, dividend, access_fee, status (`active` or `revoked`), created_at, revoked_at, readings, grants, refused, unclear, dividends_paid, bonds_received, fees_received |
| `purpose_rows` | `K1:2` | the second purpose of K1, as the person wrote it |
| `reading_rows` | `R4` | `Reading`: record, requester, use, use_digest, finding, purpose, grant, bond, dividend, to_person, at |
| `reading_index_rows` | `K1:3` | `R4`, the third reading on K1 |
| `grant_rows` | `G2` | `Grant`: record, requester, purpose, use, use_digest, reading, dividend, at |
| `grant_index_rows` | `<address>:2` | `G5`, that requester's second grant |
| `grant_count_rows` | `<address>` | how many grants that requester holds |
| `judged_rows` | sha256 of record, requester and the use's words | the reading that judged it |
| `credit_rows` | `<address>` | that address's unused credit |

Counters: `record_count`, `reading_count`, `grant_count`, `none_count`,
`unclear_count`, `revoked_count`, `refund_count`, `credits_held`,
`dividends_total`, `bonds_total`, `fees_total`. Ids are assigned by the contract from the
counters: `K` records, `R` readings, `G` grants. Addresses are compared and keyed
lower-case.

## Methods

| method | kind | does |
|---|---|---|
| `deposit()` | write, payable | credits the value to the sender; a deposit of nothing is refused and returned; no model |
| `withdraw(amount_atto)` | write | returns 1 to all of the sender's credit to the sender, in one transfer |
| `consent(label, purposes_json, dividend_atto, access_fee_atto)` | write | records K*n* for the sender: 1 to 5 distinct purposes, a dividend of 0.01 to 10 GEN, an access fee of 0.01 to 20 GEN, neither ever changed afterwards; no model, no value |
| `revoke(record)` | write | the person ends a record: no new request; the grants stand |
| `request(record, use)` | write | the doors, then the round, then the settlement, in one call; exactly one transfer, to the person: the dividend, the bond or the unclear fee |
| `record(record_id)` | view | the label, the person, the purposes as written, the dividend, the access fee, the stake, the unclear fee, the status and the counts |
| `grant(grant_id)` | view | the record, its person, the requester, the purpose number and its words, the use, its digest, the reading, the record's access fee, the time, the record's status |
| `reading(reading_id)` | view | one reading and why it landed where it did |
| `readings_of(record_id, offset, limit)` | view | a page of a record's readings, at most 20 |
| `grants_of(who, offset, limit)` | view | a page of one address's grants, at most 20 |
| `credit(who)` | view | one address's unused credit |
| `stats()` | view | the counts and `balance_owed` |
| `rules()` | view | the questions word for word, the askings, the reading rule, the combine rule, the money, the sizes and the limits |

Views take only short ids, small ints or one address: a Studio read fails above
256 bytes of encoded calldata.

## Bounds

Every request is settled in its own call. `request()` writes one reading, at
most one grant and its two index rows, and makes exactly one transfer, to the
person. It reads one record, its purposes (at most 5), one dedupe row, and the
requester's credit and grant count; it reads no earlier reading and no earlier
grant. No loop in any write runs over anything a caller can grow: the only
loops run over a record's own purposes, bounded by `MAX_PURPOSES`, or over the
characters of a text already capped at the door, where the cap applies to the
text as sent, before it is stripped. The list views page at `PAGE_CAP` = 20. No
count of requests closes a record; each use is judged once per requester, each
request is bonded, and every judgment costs the requester at least the unclear
fee.

## Reuse

`grant(id)` is the reusable part. A consumer binds a Purpose address it knows
independently, reads `grant(id)`, and acts on `requester`, `record`, `person`,
`purpose` and `access_fee`. The data room does exactly that: it opens access
only when the caller is the grant's requester, charges exactly the access fee,
and pays the person Purpose names. A
consumer can also read `record(id).status` to stop offering a revoked record to
new requesters, or `reading(id)` to show why a request was refused.

## The fixture: DataRoom

Bound at deployment to one Purpose address (refused unless it is a 0x address of
40 hex digits, not zero). One write, `open(grant)`, payable: Purpose's
`grant(id)` is read in the same call; refused, with everything sent returned,
unless the grant exists, its requester is the caller, it names a record, a
person to pay and an access fee inside Purpose's range, it was not opened here
before, and the value is exactly that fee; otherwise the fee goes to the person
Purpose names in the same call and the opening is recorded with its purpose and
its place in order. There is no listing and no price of the room's own, so the
person can neither withhold the room nor reprice it after a dividend is paid.
What an opening buys is the `access(grant)` row, which the keeper of the data
checks off-chain. State: `opening_rows` (`G1` to `Opening`: grant, record,
requester, person, fee, purpose, number), `order_rows` (`3` to `G5`),
`tally_rows` (`K1` to `Tally`: record, opened, earned). Views:
`access(grant_id)`, `tally(record_id)`, `openings(offset, limit)` (at most 20),
`room()`. Nothing is held between calls. No model runs in it.

## Limits

The model reads only the words, so a requester can lie about their use; the
grant records exactly what they said. Vague purposes give vague answers, and an
unclear reading costs the requester the unclear fee whoever made it unclear. A
one-purpose record's two COVERS askings are the same question twice. The room
records a paid opening; delivering the data is off-chain. English, in printable
ASCII. No readable clock, no record, no revoke, no request.
