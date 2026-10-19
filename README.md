# Purpose

People list the purposes they consent to in their own words; every request for
their data states its use; validators decide which purpose covers it, and an
in-purpose request pays the person a dividend while an out-of-purpose one is
refused and its bond goes to the person.

A person records what the data is ("Sleep tracker nights, 2025") and up to five
purposes they agree it may be used for, written the way they would say them:
"Academic research into sleep patterns, published only in anonymised,
aggregated form". They set the whole price up front, and nobody can change it
afterwards: a dividend, paid to them for every request one of those purposes
covers, and an access fee, paid to them when a grant holder opens the data.
Anybody else who wants the data asks for it by stating, in plain words, what
they will use it for. The network decides one thing: which
of the person's numbered purposes covers that stated use, if any. It never
decides whether the use is a good idea, whether it is legal, or whether the
requester will keep to it, and it never sees an amount or an address.

A covered use stores a **grant**: the record, the requester, the purpose that
covers the use, and the use exactly as it was stated. The dividend goes to the
person in the same transaction. A use no purpose covers is refused, and the
requester's bond goes to the person: the cost of asking for what was never
agreed. A reading that settles on neither costs the requester the unclear fee,
half the bond, so no judgment is ever free. A consumer contract,
`contracts/fixtures/data_room.py`, opens access to a record's data only to the
requester a grant names, for exactly the access fee the person set, paid to the
person.

## How consensus is used

One request is one consensus block, `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)`. Inside it the network is asked two questions, word for word:

> **COVERS** Which ONE numbered PURPOSE covers the STATED USE? Answer with that
> purpose's number, or NONE if no purpose covers it.

> **BEYOND** Does the STATED USE need something that none of the numbered
> PURPOSES agreed to? Answer yes if it does, no if it does not, or unclear.

Each asks one plain thing. COVERS asks which purpose; whether the use needs
more than the purposes agreed to is BEYOND's question alone, and the shared
scope paragraph says what "covers" means: read plainly, the person agreed to
that use in that purpose's words. A test fails if either question joins a
second condition.

Each is asked twice, all four askings inside the one block:

| asking | purposes numbered | first block | question |
|---|---|---|---|
| `covers/listed` | in the order the person listed them | purposes | COVERS |
| `covers/rotated` | rotated by one: the second listed is 1, the first listed is last | purposes | COVERS |
| `beyond/purposes_first` | in the listed order | purposes | BEYOND |
| `beyond/use_first` | in the listed order | the stated use | BEYOND |

The number read off the rotated list is mapped back to the listed number in
code. A COVERS answer is read strictly: a purpose number inside the record's
range, as an int or one or two ASCII digits with no leading zero, or the word
NONE. "purpose 2", "2.", "1 or 2", a boolean and "unclear" are all unreadable. A
BEYOND answer is yes, no or unclear. The contract combines the four readings
into one finding, and that finding is the whole stored value:

| the four readings | stored `finding` | what happens in the same transaction |
|---|---|---|
| both COVERS name purpose k, both BEYOND say no | `"k"` | a grant is stored; the dividend goes to the person; the request bond stays in the requester's credit |
| both COVERS say NONE, both BEYOND say yes | `"none"` | refused; the request bond goes to the person; the dividend stays in the requester's credit |
| anything else, an unreadable answer included | `"unclear"` | no grant; the unclear fee, 0.05 GEN, goes to the person; the rest stays in the requester's credit |

Every node builds the four prompts the same way, so a reader that leans on
position leans the same way on every node, and consensus alone would never
notice. The four askings are what catch it. A reader that names a purpose by
where it stands names two different purposes in the two numberings, and the
round lands in `unclear`. A reader swayed by which block comes first gives the
two BEYOND askings different answers, and lands in `unclear`. A reader that
answers everything affirmatively names a purpose to COVERS and says yes to
BEYOND, which contradicts it, and lands in `unclear`. The disagreement is in the
stored value, never in a tolerance.

Every validator reruns all four askings itself and compares `{"finding": ...}`
by exact string equality. A validator whose own rerun raises disagrees, and a
leader that raised is never agreed with, so no error is ever stored as if it
were an answer. The only `gl.nondet` call is inside the leader closure.

The label, the purposes and the stated use reach the model fenced (`<` and `>`
replaced, never deleted) and between delimiter lines tagged with the sha256 of
the block's own fenced text, after a paragraph that declares both blocks
untrusted. The door only admits printable ASCII on one line, so no look-alike
bracket from elsewhere in Unicode can draw a delimiter the fence does not know.
At the largest sizes the door allows, a prompt is under 6,000 characters.

## Who may do what

| call | who | refused how |
|---|---|---|
| `deposit()` | anyone, for themselves | a call that sends nothing returns `ok: false` |
| `withdraw(amount_atto)` | anyone, from their own credit | raises `[EXPECTED] ...`; nothing was sent |
| `consent(label, purposes_json, dividend_atto, access_fee_atto)` | anyone; the sender is the person | raises `[EXPECTED] ...` |
| `revoke(record)` | only the person of the record, once | raises `[EXPECTED] ...` |
| `request(record, use)` | anyone but the person, while the record is active, once per use | raises `[EXPECTED] ...` before any model is asked |

`request()` takes no value. A consensus round can end with nothing stored, an
unreachable model or no majority, and value sent with a call that stores
nothing is not safely returned. So the stake, the 0.1 GEN request bond plus the
record's dividend, is paid in by `deposit()`, which asks no model, and
`request()` spends it only once its round has produced a finding. A round that
stores nothing leaves the credit where it was.

A request is refused before any model runs when the record is missing or
revoked, when the sender is the record's person, when the stated use is not 30
to 600 printable ASCII characters with words in them, when the requester's
credit does not hold the whole stake, or when the same requester already stated
the same use on the same record. The last is a dedupe by digest, of the record,
the requester and the use's words (not their case, spacing or punctuation), and
it holds after an `unclear` reading too. A use stated in other words is a new
judgment, and every judgment costs the requester something: the dividend on a
grant, the bond on `none`, the unclear fee on `unclear`. Rewording until the
answer suits therefore pays the person each time; it is never free.

The stated use is capped at 600 characters as sent, before anything strips or
walks it, so padding cannot make the door read more than the cap.

`deposit` and `consent` are open to anyone on purpose, and the test suite lists
them with their reasons: a deposit is the sender's own credit, and a consent
makes the sender the person of a new record and binds nobody else.

A label is 3 to 60 characters, a purpose 20 to 200, a record lists 1 to 5
distinct purposes (two purposes with the same words are refused: they would
give the network two right answers), the dividend is 0.01 to 10 GEN and the
access fee 0.01 to 20 GEN. `rules()` publishes all of them.

## The money

| moment | from | to | amount |
|---|---|---|---|
| `deposit` | anyone | contract, credited to them | what they send |
| a refused `deposit` | contract | the caller | everything it sent |
| `request`, a purpose found | requester's credit | person | the dividend |
| `request`, none | requester's credit | person | the request bond, 0.1 GEN |
| `request`, unclear | requester's credit | person | the unclear fee, 0.05 GEN |
| `withdraw` | contract | the depositor | the amount asked, up to the credit |
| data room `open` | the grant's requester | person | exactly the access fee set at consent |
| a refused `open` | data room | the caller | everything it sent |

The contract only ever holds unused credit, and `stats()` publishes it as
`balance_owed`. The offline suite checks the contract's balance against the
credit rows, the counter and the published figure after every step of forty
seeded random journeys, and checks that the data room holds nothing after every
step.

### Every settlement is bounded

- `request()` judges one use, writes one reading and at most one grant, and
  makes exactly one transfer, always to the person. It reads no earlier reading
  and no earlier grant: a test counts every storage read and finds the same
  number on a record's first request and its sixty-first.
- The only loops a write reaches run over a record's own purposes, at most
  `MAX_PURPOSES` = 5, or over the characters of a text already capped at the
  door.
- `readings_of(record, offset, limit)`, `grants_of(address, offset, limit)` and
  the data room's `openings(offset, limit)` read at most 20 rows a page.
- **No count of requests closes a record.** A cap would be a door a stranger's
  spare addresses could fill and shut on everybody else. Each request is bonded,
  each use is judged once per requester, and every judgment costs the requester
  at least the unclear fee, so the work is paid for and nothing ever walks the
  readings. The one cap left, five purposes, is filled by the
  person alone when they write the record.

A static test parses both contracts and fails on any loop whose bound is not a
named constant or a page clamp.

## The consumer: DataRoom

`contracts/fixtures/data_room.py` is bound, at deployment, to one Purpose
address. It is the contract that acts on the answer, and it has one write:

| call | who | what |
|---|---|---|
| `open(grant)` | the requester the grant names, with exactly the record's access fee | reads `grant(id)` on Purpose in the same call; opens only when the grant exists, the caller is its requester, it names a record, a person and an access fee, it was not opened here before, and the value is exactly that fee; the fee goes to the person Purpose names in the same call and the grant is marked opened, once |

Nobody sets a price in the room. The access fee is the one the person wrote
into the record before anybody staked a request on it, and no method changes it
afterwards, so a requester who paid the dividend for a grant can always open the
data at the price they saw: there is no listing to withhold or reprice.

What an opening buys is the `access(grant)` row: the public record that this
grant's requester paid the person's fee here, which the keeper of the data
checks before handing it over. Where the data is kept is between the person and
their keeper; the room does not claim to hide it. Every refused `open` returns
everything it sent. A request read as `none`, or never made, can never write
that row, and neither can somebody else's grant. A revoked record's grants
still open: revoking stops new requests, and the grants made before stand.
Views: `access(grant_id)`, `tally(record_id)`, `openings(offset, limit)`,
`room()`.

## Why this has to be on GenLayer

Whether "a study at a university sleep lab comparing night-shift and day-shift
workers, published as averages" is covered by "academic research into sleep
patterns, published only in anonymised, aggregated form" is a judgement about
meaning. No keyword list settles it: change "published as averages" to
"published for each named worker" and the same words about a sleep lab are no
longer covered. A single model call is one reading that its caller controls.
Here the reading is repeated by every validator, asked in two numberings and two
block orders, and only a finding they agree on moves a bond or stores a grant.

## Who uses it

- **People who share data from a device, a study or a service**, and want to
  say what it is for in their own words rather than tick a box somebody else
  wrote.
- **Researchers and product teams** who need a record that their use was
  covered, held where anybody can check it, and naming the exact words they
  used.
- **Any contract that releases data or money on consent**: it reads
  `grant(id)` and acts on the requester, the record and the purpose, as the data
  room does.

## The limits, stated plainly

- **The model reads only the words.** It cannot see what a requester actually
  does with the data.
- **A requester can lie about their use.** The grant records exactly what they
  said, with its digest, so a use that strays from it is provable against their
  own words.
- **A person who writes vague purposes gets vague answers.** "Anything useful"
  covers whatever the words allow, and a use the words do not settle reads as
  `unclear`.
- **A one-purpose record cannot be checked for position bias.** With a single
  purpose the rotation changes nothing, so the two COVERS askings are the same
  question twice; the BEYOND askings, in both block orders, still have to agree.
- **An unclear reading costs half the bond, whoever made it unclear.** A
  person who writes vague purposes collects unclear fees from requesters who
  try them anyway; `record(id)` shows every record's unclear count before
  anybody stakes, so such a record is visible and avoidable.
- **The room records a paid opening; it does not deliver the data.** Handing
  the data over is the keeper's job, off-chain, against the `access(grant)`
  row.
- **English, in ASCII.** The ASCII door makes this an English-language contract.
- **No readable clock, no record.** Times come from the message clock,
  `gl.message_raw["datetime"]`; a transaction with no readable clock is refused.

## What is in this repository

```
contracts/purpose.py                the contract
contracts/fixtures/data_room.py     the consumer that reads it and moves money on its answer
tests/test_pure.py                  the offline suite, both contracts, the consensus round with scripted models
tests/MUTATIONS.md                  every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs            a throwaway-account run against Studio, both contracts
tools/mutate.py                     the generator that writes MUTATIONS.md and refuses to if anything survives
CONTRACTS.md                        purpose, consensus, state, methods, bounds, reuse and limits
DECISIONS.md                        why each rule is the way it is, and what is verified and what is not
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                                         # 349 tests, no network, no Studio
genvm-lint check contracts/purpose.py                    # the package is genvm-linter, the command genvm-lint
genvm-lint check contracts/fixtures/data_room.py
python tools/mutate.py                                   # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

- `pytest tests/ -q` gives **349 passed** in a few seconds, with nothing
  installed but pytest.
- `genvm-lint check` version 0.11.0 prints `Lint passed (3 checks)` and
  `Validation passed` for both files, reads Purpose as 13 methods (8 view, 5
  write) and the DataRoom as 5 (4 view, 1 write), and exits 0.
- `python tools/mutate.py` removes or inverts **246 defences** one at a
  time, 201 in the contract and 45 in the fixture, and
  **none survives**; `tests/MUTATIONS.md` names the test that failed for each.

The on-chain run generates its own keys and funds them over the network's own
RPC; it never touches a wallet of anybody's own:

```
npm ci
node tests/on_chain/smoke.mjs                  # the whole run, about 20 to 35 minutes
RESUME=1 node tests/on_chain/smoke.mjs         # continue a run that was cut off
STATE=run.json RESUME=1 node tests/on_chain/smoke.mjs
```

It plays five generated accounts, known only by their roles. PERSON consents
K1, "Sleep tracker nights, 2025", with two purposes, "Academic research into
sleep patterns, published only in anonymised, aggregated form" and "Improving
the accuracy of the sleep tracker app I use", for a dividend of 0.05 GEN and an
access fee of 0.2 GEN. UNIVERSITY states "A study at a university sleep lab
comparing sleep length in night-shift and day-shift workers; results published
as averages only" and is granted under purpose 1. APPMAKER states "Retraining
the app's sleep-stage detection on real nights to cut misread deep sleep" and is
granted under purpose 2. INSURER states "Setting health insurance premiums from
how well each customer sleeps", which no purpose covers, and its bond goes to
PERSON; stating it again is refused by its digest. STRANGER may not revoke K1.
UNIVERSITY opens its grant in the data room for the 0.2 GEN access fee, which
reaches PERSON; INSURER cannot open it and is refunded; a second open is refused
and refunded. PERSON revokes K1, a new request is refused, the grants stand, and
every requester withdraws what is left of its credit. It prints one PASS or FAIL line per check, checks
every balance it moved, and compares the deployed code of both contracts with
these files byte for byte. Every step is saved to the state file as it is made,
so a run that outlives its process continues where it stopped without sending
anything twice.

## Network

Studio, chain 61999. RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. Both contracts pin the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in their
first line.

## Evidence

Run on 19 October 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from generated accounts funded from the
Studio faucet, none of them anybody's wallet: **PERSON** consents, **UNIVERSITY**, **APPMAKER** and **INSURER** request, **STRANGER** tries what it may not. **39 passed, 0 failed**; transactions: 19 in 19 steps; sent a second time: none.
The whole log is `tests/on_chain/smoke-run.log`. The sleep-lab study was found covered by purpose 1 and the app retraining by purpose 2, each paying PERSON the 0.05 GEN dividend in the same transaction; the insurer's premium setting was found covered by none and its 0.1 GEN bond went to PERSON; the DataRoom opened only the university's grant, for 0.2 GEN to PERSON.

- `purpose.py` deployed at [`0x9fB09AaBC6b6afDF49630eef26F3B4392F522623`](https://explorer-studio.genlayer.com/address/0x9fB09AaBC6b6afDF49630eef26F3B4392F522623)
- `data_room.py` deployed at [`0xf789038d91dBFdc421965ccE06A5fDeDbc3687ea`](https://explorer-studio.genlayer.com/address/0xf789038d91dBFdc421965ccE06A5fDeDbc3687ea)

- the code deployed at 0x9fB09AaBC6b6afDF49630eef26F3B4392F522623 is byte for byte contracts/purpose.py: 51811 bytes, sha256 1287e1260b76023b23b2917f6335572bc1f5e47a9552678dbc899f63bd355cdf
- the code deployed at 0xf789038d91dBFdc421965ccE06A5fDeDbc3687ea is byte for byte contracts/fixtures/data_room.py: 12080 bytes, sha256 a6fb3c169a43fb25bb8666eee79e5e5acef579baa1cb0ecbf72728d89799eece

| step | by | transactions | votes |
|---|---|---|---|
| DataRoom is bound to the Purpose address it was deployed with, and holds nothing yet | PERSON | [0xe36c3e3e…](https://explorer-studio.genlayer.com/tx/0xe36c3e3ede89a79dcd5fa594e004367016877cc6a046fec9184860f7b7c4a9ae), [0xefe1d35e…](https://explorer-studio.genlayer.com/tx/0xefe1d35e8403cb9363f6f42fc608b850800ece94440f619c0579bec8347b7a4b) | 3 agree, 0 disagree, 2 idle |
| PERSON consents: two purposes, a dividend of 0.05 GEN per granted request, an access fee of 0.2 GEN, no value moved | PERSON | [0x3c8650ae…](https://explorer-studio.genlayer.com/tx/0x3c8650aeae323eddf96b25a848fedd91a7ff15c63c285cd9707935a5c442d9ce) | 3 agree, 0 disagree, 2 idle |
| UNIVERSITY deposits 0.15 GEN of credit: the request bond and the dividend; no model runs | UNIVERSITY | [0x525d4796…](https://explorer-studio.genlayer.com/tx/0x525d4796921c1e1e40385fc0501bfa8d768370fa2b95126a865792ba871bc83c) | 3 agree, 0 disagree, 2 idle |
| APPMAKER deposits 0.15 GEN of credit: the request bond and the dividend; no model runs | APPMAKER | [0xe639a772…](https://explorer-studio.genlayer.com/tx/0xe639a772ddc2c66683970fbc507ce806f6cb5718fd8584392546f2112133d02b) | 3 agree, 0 disagree, 2 idle |
| INSURER deposits 0.15 GEN of credit: the request bond and the dividend; no model runs | INSURER | [0x58aa3cf5…](https://explorer-studio.genlayer.com/tx/0x58aa3cf5eca0d5ecaf0d6cb8bec83e35a233d61ab44168992ab7a4150acabe4e) | 3 agree, 0 disagree, 2 idle |
| UNIVERSITY's sleep-lab study, published as averages, is found covered by purpose 1 | UNIVERSITY | [0x1c6d7a81…](https://explorer-studio.genlayer.com/tx/0x1c6d7a81d5c416281bdeb0df71cdfc1e6b099cfb50801d844f1b542a0308286d) | 3 agree, 0 disagree, 2 idle |
| APPMAKER's retraining of the app's sleep-stage detection is found covered by purpose 2 | APPMAKER | [0x09034acc…](https://explorer-studio.genlayer.com/tx/0x09034acc968df2fa98b7266a5b8f79655c8cee8c2ca671f0276222c4e07b74ea) | 3 agree, 0 disagree, 2 idle |
| INSURER's premium setting is found covered by no purpose: none | INSURER | [0xb2176530…](https://explorer-studio.genlayer.com/tx/0xb21765305c910aea9ea2ad0cad4efe8ae1d45865c29beca5f1e2b1cf0b4cdfad) | 3 agree, 0 disagree, 2 idle |
| INSURER states the same use again: refused by its digest before any model runs, nothing taken | INSURER | [0xb90e21d2…](https://explorer-studio.genlayer.com/tx/0xb90e21d24316c21115c23f52fd1ccaef432cb630f463a078ea57ae4472a59956) | 3 agree, 0 disagree, 2 idle |
| STRANGER tries to revoke K1: refused, only the person may | STRANGER | [0x2e174ea6…](https://explorer-studio.genlayer.com/tx/0x2e174ea60ca9bba149a2ec59bec0e36efd7fb8d17d4e83bddcd471a3cfaf67bf) | 3 agree, 0 disagree, 2 idle |
| UNIVERSITY opens its grant: Purpose names it as the requester and names the 0.2 GEN access fee, so the room opens | UNIVERSITY | [0x7fe97506…](https://explorer-studio.genlayer.com/tx/0x7fe975068452581e1bc06726f81511422495f32089d756e66e25de8b2aa70fa8) | 3 agree, 0 disagree, 2 idle |
| INSURER, which holds no grant, tries to open the university's: refused, and the 0.2 GEN come back | INSURER | [0x5638c0f7…](https://explorer-studio.genlayer.com/tx/0x5638c0f7219ce52838b1970840e29b2b51be9b32d62e9ee50a7462220b87a8da) | 3 agree, 0 disagree, 2 idle |
| UNIVERSITY opens the same grant again: refused, a grant opens once, refunded | UNIVERSITY | [0x731c7de8…](https://explorer-studio.genlayer.com/tx/0x731c7de8f8f937e50943566ed501ac53d9bd9d85135b7eadba4c19cb9fc94b9a) | 3 agree, 0 disagree, 2 idle |
| PERSON revokes K1; the two grants made before stand | PERSON | [0x76c4750b…](https://explorer-studio.genlayer.com/tx/0x76c4750bcda2e10c586bc46924f75d1b30178c5ddcedc34884aa8ea5321332c9) | 5 agree, 0 disagree, 0 idle |
| APPMAKER's new request on the revoked record is refused before any model runs | APPMAKER | [0x3bb0b3a7…](https://explorer-studio.genlayer.com/tx/0x3bb0b3a74fcc19da914ab0719e5298952632d76cf90923cf495caa9f0c01f074) | 3 agree, 0 disagree, 2 idle |
| UNIVERSITY withdraws the 0.1 GEN of credit it has left | UNIVERSITY | [0x2369c585…](https://explorer-studio.genlayer.com/tx/0x2369c5853bac20b9487084c9abbd944adecb91c04daf691f9e68994541284eff) | 3 agree, 0 disagree, 2 idle |
| APPMAKER withdraws the 0.1 GEN of credit it has left | APPMAKER | [0x967075e7…](https://explorer-studio.genlayer.com/tx/0x967075e77d7966c253f037ca45f9f70239c62f7f6f5eb69ebcb6b32078a9fa1c) | 3 agree, 0 disagree, 2 idle |
| INSURER withdraws the 0.05 GEN of credit it has left | INSURER | [0x6aaf868f…](https://explorer-studio.genlayer.com/tx/0x6aaf868f27aaab662084a81b830de3eebe7552d934d8c088b5d2d1b840930791) | 5 agree, 0 disagree, 0 idle |

## Licence

MIT. See `LICENSE`.
