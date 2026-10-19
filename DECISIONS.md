# Decisions

The boundary first, then the questions, the prompt, the storage, the money, why
settlement is bounded and why no cap can be filled by a stranger, the doors and
the consumer, then what is verified and what is not.

## 1. The boundary: what the network agrees on

**One finding per request.** The stored value is `{"finding": ...}`: the number
of the purpose that covers the use, `none`, or `unclear`, a token the contract
wrote from a closed set. Not a score, not a quote of the words that matter, not
a list of every purpose that might apply. What has to be decided is whether the
person agreed to this use, and the coarsest answer that carries it, and also says
which of their words agreed, is one purpose number or none. Anything finer, a
degree of fit or the model's reasons, would put a value in storage that honest
nodes could reach differently while believing the same thing.

**The person writes the purposes; the requester writes the use; neither writes
the question.** Both texts are free: the point of the contract is that consent is
in the person's own words, not a box from a fixed list. The two questions are
contract constants, word for word in `rules()`.

**It decides nothing else.** Not whether the use is a good idea, not whether it
is legal, not whether the requester will do what they say. The scope paragraph,
shared by every asking, says so.

## 2. Two questions, each asked twice, in one block

Every validator builds the prompt the same way, so a reader that leans on
position leans the same way on every node, and the network would agree on a
biased answer. Two kinds of position matter here: where a purpose stands in the
numbered list, and which block comes first. A reader can also lean on
affirmation: answer every question in its affirmative.

So the block asks four times, sequentially, inside the one leader closure:

- **COVERS, listed and rotated.** The same question with the purposes numbered
  in the order the person listed them, and again rotated by one and numbered
  again. The rotated answer is mapped back in code. Rotation, not reversal:
  reversing an odd-length list leaves the middle purpose where it was, and a
  reader that always named the middle number would then name the same purpose in
  both askings. Rotated, with two or more purposes, every purpose moves. A
  reader that names a purpose by where it stands names two different purposes,
  and the round is `unclear`.
- **BEYOND, purposes first and use first.** The question the other way round:
  not "which purpose covers it" but "does it need something none of them agreed
  to". A reader that answers every question in its affirmative names a purpose
  to COVERS (covered) and says yes to BEYOND (not covered); the two contradict,
  and the round is `unclear`. Asking BEYOND in both block orders catches a
  reader swayed by which block it read first.

A purpose is found only when both COVERS askings name it and both BEYOND
askings say the use needs nothing beyond the purposes; `none` only when both
COVERS askings say NONE and both BEYOND askings say it does. Everything else is
`unclear`, in the value, where every node computes it the same way. Nested
nondet blocks are not legal, and four separate blocks would be four consensus
rounds that could each settle a different way; one block with four sequential
prompts is one value, compared once.

**One plain thing per question.** A compound question once made a live run
read `unclear` where the honest answer was clear, so each question asks one
thing and then says what each answer means. COVERS asks only which purpose
covers the use; an earlier wording also asked, in the same sentence, that the
use need nothing beyond that purpose, which is two conditions, and a use that
needs two purposes together split honest readers between a number and NONE.
That second condition is BEYOND's question and nobody else's, and BEYOND's
answer key says "no if it does not", without tying a question about all the
purposes to a single one. What "covers" means is said once, in the shared scope
paragraph: read plainly, the person agreed to that use in that purpose's words.
A test reads both questions and fails on any joint ("and", "or", a comma, a
semicolon, "only if", "unless", "nothing beyond") before the question mark.

**A strict reader.** A COVERS answer counts only as a purpose number inside the
record's range, as an int or one or two ASCII digits with no leading zero, or the
word NONE. "purpose 2", "2.", "1 or 2", "unclear", a boolean and a number past
the record's purposes are unreadable, and an unreadable answer can only ever land
in `unclear`. A lenient reader would have to choose what "1 or 2" means, and two
nodes could choose differently.

**Exact equality, and no agreement with an error.** The validator reruns all
four askings itself and compares the finding by string equality. If its own
rerun raises, it disagrees: it has not derived the leader's value. If the leader
raised, it disagrees as well: an unreachable model is not an answer, and the
round is not stored.

## 3. The call that asks the network carries no value

A round that no majority carries ends the transaction without storing anything.
If that transaction had carried value, where the value goes is up to the
network, and no line of the contract runs after the round fails. On Studio a
payable call that a raise rolls back has been measured keeping the coins.

So `request()` is not payable. A requester first sends value to `deposit()`,
which runs no model, and each request stakes the request bond and the record's
dividend from that credit. The stake moves only on a finding: the dividend on a
grant, the bond on none, nothing on unclear. `withdraw(amount)` returns any part
of the sender's credit at any time, because no request holds credit between
calls. A static test finds that no payable method reaches the round, that
`request` is the only method that does, and that every refusal in it comes
before the round and every write after it. An offline test fails a round inside
`request()` and finds nothing written, nothing moved and the credit intact.

**Payable methods never run the model and never raise after taking value.**
`deposit()` and the data room's `open()` refuse by returning everything sent
with `{"ok": false, "reason", "returned"}`. A static test walks every helper
they reach and finds no `raise`, no `_fail` and no `_clock`.

## 4. The prompt

**The fence and the tag.** The label, every purpose and the stated use pass
through `_fence`, which replaces `<` with `(` and `>` with `)` and never deletes,
so the length is kept. Each block sits between two delimiter lines tagged with
the first 16 hex characters of the sha256 of its own fenced body. The purposes
are public once recorded, so a requester could compute their tag and write it
into a use; once fenced, a use holds no angle bracket and cannot write a line
that starts with `<<<`. A test plants the purposes' genuine closing line and an
instruction inside a use and finds exactly four delimiter lines, the forgery
demoted to `(((END PURPOSES tag)))`. A static test checks every value
interpolated into the prompt is a fenced block or a contract constant.

**ASCII on one line at the door.** The fence only knows the two ASCII brackets.
Unicode has look-alikes that a model reads as brackets, so the door refuses
anything outside printable ASCII, and line breaks with it, which also keeps one
purpose on one numbered line. Nothing over a length cap is ever sampled: it is
refused, so every character judged is in the prompt. The cap applies to the
text as sent, before it is stripped: an earlier version stripped first and then
read the words of the unstripped argument, so a short use padded with a million
spaces passed the door and made the word reader walk every space. A test sends
exactly that and finds it refused before any reader runs. At the largest sizes the
door allows a prompt is under 6,000 characters, well under 12,000.

**What a program can check is checked before asking.** Whether the record
exists, is active, and belongs to somebody other than the requester; whether the
use has words in it and fits its length; whether this requester already stated
this use; whether two of the person's purposes are the same words; whether the
credit holds the stake. None of it is put to the model.

**The model never sees an amount or an address.** A test consents with a
dividend of distinctive digits and finds none of them, and no address, in any
prompt; two requesters stating the same use send the very same four prompts.

## 5. The storage and the caller's JSON

Scalars only inside the three `@allow_storage` dataclasses: a collection inside a
storage dataclass kills the VM. A record's purposes are rows of their own, keyed
`K1:1`, `K1:2`, ...; a record's readings are indexed `K1:1`, `K1:2`, ...; a
requester's grants are indexed `<address>:1`, `<address>:2`, ... with a count
row; the dedupe is a row keyed by the digest of the record, the requester and the
use's words. Ids are assigned by the contract from counters. Addresses are keyed
lower-case, and every comparison with the sender lower-cases both sides.

The purposes arrive as caller JSON. The text is refused above 2,400 characters
before anything reads it; then refused if it opens any array or object inside
its outer array, by a scan that skips brackets inside strings, so a deep nest
never reaches the parser's recursion; then parsed with hooks that refuse
fractions, NaN and Infinity, because a float traps the VM; then checked to be a
list of 1 to 5 distinct strings, each through the same door as every other text.
Every non-string argument is checked with `isinstance` before a string method
touches it, and `_whole` refuses a bool, a negative number and digits outside
ASCII. Views take only short ids, small ints or one address.

## 6. The money

| finding | the requester's stake | the person |
|---|---|---|
| purpose k | the dividend leaves the credit; the bond stays | paid the dividend, and a grant names the use |
| none | the bond leaves the credit; the dividend stays | paid the bond, the cost of asking for what was never agreed |
| unclear | the unclear fee, half the bond, leaves the credit | paid the unclear fee |

**No judgment is free.** An earlier version moved nothing on `unclear`. The
dedupe is keyed by the use's words, so a requester could add a word ("this
year", "at night") and have the same question judged again, for nothing, until
a wording landed on a purpose; only a `none` cost anything. Now every judgment
costs the requester something, paid to the person: the dividend on a grant, the
bond on `none`, and on `unclear` the unclear fee, 0.05 GEN, half the bond. The
dedupe still refuses identical words before any model runs; the fee prices the
variety. Rewording an unclear use is still the way forward, and it costs 0.05
GEN a try.

Half the bond, not the whole of it, because an `unclear` reading is not always
the requester's doing: the person's own words may be vague. Half keeps a
re-roll from being free without charging an honest requester the full price of
a refusal. The fee goes to the person rather than nowhere because there is
nowhere else for it to go that nobody could game, and a person who writes vague
purposes to collect unclear fees is visible before anybody stakes: `record(id)`
shows every record's unclear count. Sending a share to the validators who did
the work would reward the same validators for reading `unclear`.

The bond and the dividend are separate so that the person's price for a granted
use and the cost of a refused one can each be what they should be: the dividend
is the person's to set, from 0.01 to 10 GEN; the bond is the contract's, 0.1 GEN
for everybody. The stake checked before the round is the bond plus the
dividend, which covers the largest of the three outcomes.

**The whole price is fixed before anybody stakes.** The person sets the access
fee, 0.01 to 20 GEN, in the same `consent` call as the dividend, and no method
changes either afterwards; a static test finds that only `consent` writes a
record's access fee. An earlier version let the person list access in the data
room and change the fee at any time, or never list at all: a requester could
pay the dividend for a grant and then find the access it paid for withheld or
repriced to the cap, with no way back to the dividend. Now the room reads the
fee from Purpose's own `grant(id)` view and charges exactly that.

Value leaves only through `_Payee(address).emit_transfer(value=...)`, always
after every row of the call is written; a test latches the state at the moment of
each transfer and finds the rows already there.

## 7. Bounded settlement, and no cap a stranger can fill

A settlement that has to walk every held stake in one transaction can grow past
what one transaction may do and strand the money it was meant to pay. Here no
request is held past the call that judged it: `request()` writes one reading, at
most one grant and its index rows, and makes exactly one transfer. It reads no
earlier reading and no earlier grant. A test counts every storage read and finds
the same number on a record's first request and its sixty-first, and a static
test fails on any loop whose bound is not a named constant or a page clamp. The
only loops a write reaches run over the record's own purposes, at most five, or
over the characters of a capped text.

There is no cap on requests. A cap would be a door: a stranger with spare
addresses could fill it and shut every honest requester out, or the person could
fill it to stop anybody asking. Instead every request is bonded from the
requester's own credit, and the same use by the same requester on the same
record is judged once, by its digest, so repetition is refused before any model
runs and variety costs at least the unclear fee each time it is judged. The lists that grow, the
readings of a record and the grants of a requester, are paged at 20.

The caps that remain cannot be filled by anybody but the one who benefits from
them. Five purposes per record is filled by the person alone, when they write
the record; nobody else can add a purpose. The page size of 20 closes nothing.
The data room's one-opening-per-grant is filled only by the grant's own
requester paying the fee the person set, which is the outcome both parties
agreed.

## 8. The doors and the routes out

Every write either compares the sender and refuses, or is listed in a static
test with its reason. Open on purpose: `deposit` (the credit is the sender's own)
and `consent` (the sender becomes the person of a new record, which binds nobody
else). Gated: `withdraw` (the sender's own credit), `revoke` (the person only),
`request` (never the person), and the data room's one write, `open` (the
requester the grant names).

Every refused party has somewhere to go, and each route is a journey in the
suite, not a single call: a requester without credit deposits and asks again; a
requester read `unclear` tops up the unclear fee and states the use in plainer
words; a requester read `none` states a use a purpose covers, or withdraws what
is left; a requester refused by a revoked record withdraws its credit; a
requester whose round stored nothing asks again or withdraws; an opener refused
for the wrong fee pays the fee the record names; an opener without a grant asks
for one with a covered use and opens; a grant holder opens at the fee it saw
whatever the person does next, revoking or consenting again at a higher fee
included; a person who revoked consents again under a new record. "Somewhere to
go" never means asking the same question until the answer suits: the dedupe
refuses the same words, and every other wording pays for its judgment.

## 9. The consumer

The data room binds the Purpose address its deployer knows independently and
reads `grant(id)` in the same call that takes the fee, inside one guarded helper,
`_grant_on_purpose`, the only cross-contract read in the file. The grant's
requester must be the caller; the grant must name a record, a person to pay and
an access fee inside the range Purpose accepts; the grant must not have been
opened here; the value must be exactly that fee. The fee goes to the person
Purpose names in the same call, so the room holds nothing between calls; every
refusal returns everything sent. A revoked record's grants still open, because
revoking stops new requests and the grants made before stand; refusing them
would let a person take the dividend for a use and then refuse the access it
paid for.

The room has no listing and no price of its own. Its one write is `open`, so
there is nothing the person can withhold or reprice after a dividend is paid:
the fee was in `record(id)` before the requester staked anything.

**What the fee buys.** An earlier version handed over a "pointer" to where the
data is kept on a paid open, while its own `listing()` view gave the same
pointer to anybody for free; contract storage is public, so a paid secret on
chain is no secret. The pointer is gone. What an opening buys is the
`access(grant)` row: the public record that this grant's requester paid the
person's fee here. The keeper of the data checks that row before handing the
data over, off-chain, and nobody else can write it.

The holder check comes before the opened-once check on purpose: somebody else's
grant is refused as somebody else's, whether or not its requester has already
opened it, so the refusal says the thing that matters.

## 10. What is verified and what is not

Verified offline, on every run of `pytest tests/ -q`: the prompt boundary, the
four askings and their mapping back, the strict readers, every cell of the
combine table through the round, readers led by position, by block order and by
affirmation all landing in `unclear`, the consensus comparison with a world per
node, every door, every settlement path and its single transfer, the money table
after every step of forty seeded random journeys, every route out, the data
room's refusals and refunds, and the static rules above. `tools/mutate.py`
removes each defence in turn and the suite catches every one;
`tests/MUTATIONS.md` names the test.

Not verified offline: how a live model reads these particular purposes and uses.
The scripted readers are honest about the demonstration by construction. That is
what `tests/on_chain/smoke.mjs` is for: it runs the demonstration on Studio with
real validators, and the run is recorded in the README once it has run.
