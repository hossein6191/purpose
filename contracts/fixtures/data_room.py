# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""DataRoom: opens access to a person's data only to the requester a Purpose grant names.

One data room is bound, at deployment, to one Purpose contract. A requester who
holds a grant on Purpose opens access by paying exactly the access fee the
record's person fixed at consent, and the room decides by Purpose's own view of
the grant, read here and now in the same call:

    the grant exists on Purpose, its requester is    -> the fee goes to the person Purpose names, and the
    the caller, it names a record, a person and an      grant is marked opened here, with who paid what
    access fee, it was not opened here, and the         to whom and under which purpose
    value is exactly that fee
    anything else: no such grant, somebody else's    -> refused, and everything the caller sent comes back
    grant, the wrong fee, a grant opened before,
    Purpose unreachable

Nobody sets a price here. The fee is the one the person wrote into the record
before anybody staked a request on it, and nobody can change it afterwards, so
a requester who paid the dividend for a grant can always open the data at the
price they saw. There is no listing the person could withhold or reprice.

What an opening buys is the access(grant) row: the record, kept where any
contract and anybody can read it, that this grant's requester paid the person's
fee here. The keeper of the data checks that row before handing the data over;
where the data is kept is between the person and their keeper, and nothing here
claims to hide it. A request read as outside every purpose, or never made, can
never write that row, and neither can somebody else's grant. A grant opens once.
Nothing is held here between calls: every fee is paid out in the call that took
it.

The room binds the Purpose address its deployer knows independently. No model
runs here. It is a fixture: small on purpose, and here to be read.
"""

import json
import typing
from dataclasses import dataclass

from genlayer import *


ERROR_EXPECTED = "[EXPECTED]"
GEN = 10 ** 18
MIN_FEE, MAX_FEE = GEN // 100, 20 * GEN      # the access fees Purpose accepts at consent
MAX_ID_DIGITS = 9
PAGE_CAP = 20
ZERO = "0x0000000000000000000000000000000000000000"
HEX = "0123456789abcdef"
DIGITS = "0123456789"


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


def _fail(message: str) -> typing.NoReturn:
    raise gl.vm.UserError(ERROR_EXPECTED + " " + message)


def _low(address: typing.Any) -> str:
    return (address.as_hex if hasattr(address, "as_hex") else str(address)).lower()


def _address_problem(raw: typing.Any, what: str) -> str:
    if not isinstance(raw, str):
        return what + " must be an address written as text"
    s = raw.strip().lower()
    if len(s) != 42 or not s.startswith("0x") or any(ch not in HEX for ch in s[2:]):
        return what + " is 0x followed by 40 hexadecimal characters"
    if s == ZERO:
        return what + " may not be the zero address"
    return ""


def _is_id(text: str, prefix: str) -> bool:
    """Exactly the ids Purpose assigns: the prefix, then 1 to 9 ASCII digits with no leading zero.

    `str.isdigit` would also accept a superscript two or Arabic-Indic digits,
    and "G01" is not "G1": Purpose never assigns such an id.
    """
    digits = text[1:]
    return (text.startswith(prefix) and 1 <= len(digits) <= MAX_ID_DIGITS and digits[0] != "0"
            and all(ch in DIGITS for ch in digits))


def _id_of(raw: typing.Any) -> str:
    return raw.strip() if isinstance(raw, str) else ""


def _whole(raw: typing.Any) -> int:
    """A non-negative whole number from an int or a string of ASCII digits, or -1. Never raises."""
    if isinstance(raw, bool):
        return -1
    if isinstance(raw, int):
        return raw if raw >= 0 else -1
    if isinstance(raw, str):
        s = raw.strip()
        if s and len(s) <= 40 and all(ch in DIGITS for ch in s):
            return int(s)
    return -1


def _no_float(raw: str) -> typing.NoReturn:
    """The json.loads hook: a fraction, NaN or Infinity in what Purpose returned is refused, never built."""
    raise ValueError("no fractions: " + str(raw)[:20])


def _loads(raw: typing.Any) -> typing.Dict[str, typing.Any]:
    """A JSON object read from another contract, or {} when it is not one. Never raises, never builds a float."""
    try:
        table = json.loads(str(raw), parse_float=_no_float, parse_constant=_no_float)
    except Exception:
        return {}
    return table if isinstance(table, dict) else {}


@allow_storage
@dataclass
class Opening:
    grant: str
    record: str
    requester: Address
    person: Address
    fee: u256
    purpose: u32
    number: u32


@allow_storage
@dataclass
class Tally:
    record: str
    opened: u32
    earned: u256


class DataRoom(gl.Contract):
    purpose: Address
    opening_rows: TreeMap[str, Opening]    # "G1" -> G1 was opened here, once
    order_rows: TreeMap[str, str]          # "3"  -> "G5", the third opening here
    tally_rows: TreeMap[str, Tally]        # "K1" -> how often K1 was opened here, and what its person was paid
    opening_count: u32
    refund_count: u32
    paid_total: u256

    def __init__(self, purpose: str) -> None:
        problem = _address_problem(purpose, "the Purpose contract")
        if problem:
            _fail(problem)
        self.purpose = Address(purpose.strip().lower())
        self.opening_count = u32(0)
        self.refund_count = u32(0)
        self.paid_total = u256(0)

    @gl.public.write.payable
    def open(self, grant: str) -> str:
        """Pay exactly the record's access fee and open access under a grant. Refused, with a refund, unless the grant
        is the caller's.

        Never raises after taking value. Purpose is asked here, in this call,
        what the grant says; only a grant held by the caller, naming a record,
        a person and an access fee, and not opened here before, opens, and the
        fee goes to the person Purpose names in the same call, so the room
        never holds money.
        """
        value = int(gl.message.value)
        sender = gl.message.sender_address
        me = _low(sender)
        gid = _id_of(grant)
        problem = ""
        seen = {}
        if not _is_id(gid, "G"):
            problem = "a grant id is G followed by digits, as Purpose assigns it"
        else:
            seen = self._grant_on_purpose(gid)
            if not seen:
                problem = "Purpose could not be read for " + gid + "; nothing was opened"
            elif str(seen.get("grant", "")) != gid:
                problem = "Purpose has no grant " + gid + "; access opens only under a grant"
        # who holds the grant, as Purpose says; a grant opens for its own requester and for nobody else
        holder = str(seen.get("requester", "")).lower() if not problem else me
        if holder != me:
            problem = gid + " was granted to another address; a grant opens only for its own requester"
        kid = str(seen.get("record", ""))
        person = str(seen.get("person", "")).strip().lower()
        fee = _whole(seen.get("access_fee", ""))
        if not problem:
            if not _is_id(kid, "K") or _address_problem(person, "the person"):
                problem = "Purpose's grant " + gid + " names no record or no person to pay; nothing was opened"
            elif not (MIN_FEE <= fee <= MAX_FEE):
                problem = "Purpose's grant " + gid + " names no access fee the person could have set"
            elif gid in self.opening_rows:
                problem = gid + " was already opened here; a grant opens once"
            elif value != fee:
                problem = ("send exactly the access fee the person set for " + kid + ", " + str(fee)
                           + " atto; this call sent " + str(value))
        if problem:
            return self._refuse(sender, value, problem)
        k = _whole(seen.get("purpose", ""))
        payee = Address(person)
        self.opening_count = u32(int(self.opening_count) + 1)
        n = int(self.opening_count)
        self.opening_rows[gid] = Opening(grant=gid, record=kid, requester=sender, person=payee, fee=u256(value),
                                         purpose=u32(max(k, 0)), number=u32(n))
        self.order_rows[str(n)] = gid
        if kid in self.tally_rows:
            t = self.tally_rows[kid]
            t.opened = u32(int(t.opened) + 1)
            t.earned = u256(int(t.earned) + value)
        else:
            self.tally_rows[kid] = Tally(record=kid, opened=u32(1), earned=u256(value))
        self.paid_total = u256(int(self.paid_total) + value)
        # The money moves after everything above is written.
        _Payee(payee).emit_transfer(value=u256(value))
        return json.dumps({"ok": True, "grant": gid, "record": kid, "fee": str(value), "paid_to": person,
                           "purpose": max(k, 0), "opening": n})

    # ----------------------------------------------------------------- views

    @gl.public.view
    def access(self, grant_id: str) -> str:
        """Whether a grant was opened here, by whom, for what fee and to whom: what the keeper of the data checks."""
        gid = _id_of(grant_id)
        if gid not in self.opening_rows:
            return json.dumps({"grant": gid[:12], "opened": False})
        x = self.opening_rows[gid]
        return json.dumps({"grant": gid, "opened": True, "record": str(x.record), "requester": _low(x.requester),
                           "paid_to": _low(x.person), "fee": str(int(x.fee)), "purpose": int(x.purpose),
                           "opening": int(x.number)})

    @gl.public.view
    def tally(self, record_id: str) -> str:
        """How often one record's data was opened here, and what its person was paid for it."""
        kid = _id_of(record_id)
        if kid not in self.tally_rows:
            return json.dumps({"record": kid[:12], "opened": 0, "earned": "0"})
        t = self.tally_rows[kid]
        return json.dumps({"record": kid, "opened": int(t.opened), "earned": str(int(t.earned))})

    @gl.public.view
    def openings(self, offset: int, limit: int) -> str:
        """One page of openings, oldest first. `limit` is at most 20, so a reply always has a size."""
        n = int(self.opening_count)
        start = max(_whole(offset), 0)
        size = min(max(_whole(limit), 1), PAGE_CAP)
        count = min(max(n - start, 0), size, PAGE_CAP)
        rows = []
        for i in range(count):
            x = self.opening_rows[str(self.order_rows[str(start + 1 + i)])]
            rows.append({"grant": str(x.grant), "record": str(x.record), "fee": str(int(x.fee))})
        return json.dumps({"total": n, "offset": start, "limit": size, "rows": rows})

    @gl.public.view
    def room(self) -> str:
        return json.dumps({"purpose": _low(self.purpose), "openings": int(self.opening_count),
                           "refunds": int(self.refund_count), "paid_total": str(int(self.paid_total)),
                           "fee": "the access fee the record's person set at consent on Purpose, exactly",
                           "opens_only": "a grant on Purpose, for its own requester, once"})

    # --------------------------------------------------------------- helpers

    def _grant_on_purpose(self, gid: str) -> typing.Dict[str, typing.Any]:
        """Purpose's own view of one grant, read now, or {} when it cannot be read. Never raises."""
        try:
            raw = gl.get_contract_at(self.purpose).view().grant(gid)
        except Exception:
            return {}
        return _loads(raw)

    def _refuse(self, sender: typing.Any, value: int, reason: str) -> str:
        """Return everything that was sent and say why. Never raises."""
        self.refund_count = u32(int(self.refund_count) + 1)
        if value > 0:
            _Payee(sender).emit_transfer(value=u256(value))
        return json.dumps({"ok": False, "reason": reason, "returned": str(value)})
