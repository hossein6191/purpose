/* Purpose and the data room against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copies.
 *
 *   npm ci                                                  # genlayer-js 1.1.8 and viem 2.56.8
 *   node tests/on_chain/smoke.mjs                           # the whole run, from a fresh state
 *   RESUME=1 node tests/on_chain/smoke.mjs                  # continue a run that was cut off
 *   STATE=/some/dir/run.json RESUME=1 node tests/on_chain/smoke.mjs   # the same, with the state kept elsewhere
 *
 * Five generated accounts play the story, known only by their roles: PERSON, whose sleep tracker nights
 * these are; UNIVERSITY runs a sleep lab; APPMAKER makes the tracker app; INSURER sells health insurance;
 * STRANGER holds nothing and tries to revoke somebody else's consent.
 *
 *   1  deploy Purpose, then deploy DataRoom bound to it.
 *   2  PERSON consents K1, "Sleep tracker nights, 2025", with two purposes in their own words:
 *      1 "Academic research into sleep patterns, published only in anonymised, aggregated form" and
 *      2 "Improving the accuracy of the sleep tracker app I use", for a dividend of 0.05 GEN per
 *      granted request and an access fee of 0.2 GEN per opening, both fixed from then on.
 *      UNIVERSITY, APPMAKER and INSURER each deposit 0.15 GEN of credit: the 0.1 GEN request bond
 *      and the dividend.
 *   3  three requests, each one consensus round asked four ways. UNIVERSITY: a sleep-lab study of
 *      night-shift and day-shift workers, published as averages -> purpose 1, grant G1, 0.05 GEN to
 *      PERSON. APPMAKER: retraining the app's sleep-stage detection -> purpose 2, grant G2, 0.05 GEN
 *      to PERSON. INSURER: setting premiums from how well each customer sleeps -> none, and the
 *      insurer's 0.1 GEN bond goes to PERSON. INSURER asks the same again: refused by its digest, no
 *      model asked. STRANGER tries to revoke K1: refused.
 *   4  the data room acts on the grants, at the access fee K1 names; nobody lists or prices anything
 *      there. UNIVERSITY opens G1: the 0.2 GEN reach PERSON in the same call. INSURER tries to open
 *      G1: refused, the 0.2 GEN come back. UNIVERSITY opens G1 again: refused, refunded.
 *   5  PERSON revokes K1; APPMAKER's new request is refused; the grants stand. Each requester
 *      withdraws the credit it has left.
 *   6  the views read back, the code deployed at both addresses compared with the two files byte for
 *      byte, both contracts' balances read, and every account's net movement checked against what
 *      the receipts say.
 *
 * Every refusal is a signed transaction. Balances are read after finalisation, because a transfer
 * lands at FINALIZED, not at ACCEPTED. Transactions are polled with eth_getTransactionByHash, never
 * with views (gen_call is rate limited per client, shared with sim_fundAccount). A round no majority
 * carried stores nothing and, since a request carries no value, strands nothing; it is sent again and
 * both transactions are kept. Every step is saved as it is made, so a run cut off part way continues
 * without sending anything twice. Every id (K1, R1, G1, ...) is read from the receipt that created it,
 * never assumed. A whole run takes about 20 to 35 minutes, most of it the three judged requests, each
 * asked four ways by every validator. Nothing waits on a window.
 *
 * A state file remembers the sha256 of both contracts it deployed, and a RESUME against a state made
 * from other files stops before sending anything.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const STATE = process.env.STATE || join(tmpdir(), "purpose-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const PURPOSE_FILE = new URL("../../contracts/purpose.py", import.meta.url);
const ROOM_FILE = new URL("../../contracts/fixtures/data_room.py", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ---------- state: keys, addresses and every step already made survive a cut-off run ----------
const st = existsSync(STATE) && process.env.RESUME ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
const SOURCE_SHA = { purpose: sha(readFileSync(PURPOSE_FILE)), room: sha(readFileSync(ROOM_FILE)) };
if (st.source_sha256 && (st.source_sha256.purpose !== SOURCE_SHA.purpose || st.source_sha256.room !== SOURCE_SHA.room)) {
  console.log(`the state file ${STATE} belongs to a run of other contract files; start a fresh run without RESUME, or name another STATE`);
  process.exit(2);
}
st.source_sha256 = SOURCE_SHA;
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = {
  person: "the person whose sleep tracker nights K1 records, and who is paid for every reading and opening",
  university: "the university sleep lab, whose study is covered by purpose 1",
  appmaker: "the maker of the sleep tracker app, whose retraining is covered by purpose 2",
  insurer: "the insurer, whose premium setting no purpose covers",
  stranger: "a stranger, who tries to revoke somebody else's consent",
};
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
const low = (a) => String(a).toLowerCase();
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed; amount in atto, as a number
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so
// nothing is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${errText(e).slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => low(t.from_address) === low(addr) && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settle = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step: a signed transaction, its tally, what it returned, and the balances it moved. opt.at
// names the contract (Purpose unless said), opt.watch names addresses whose balances are read before
// and after, and opt.expect the change each should show: a table, or a function of what the call
// returned, because what a request moves depends on how it was read.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, at: opt.at || "purpose", args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    if (!rec.before) { rec.before = {}; for (const [k, a] of Object.entries(opt.watch || {})) rec.before[k] = String(await balance(a)); save(); }
    const address = (opt.at || "purpose") === "room" ? st.room : st.purpose;
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(0, 22)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const last = rec.tries[rec.tries.length - 1];
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(last.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const [k, a] of Object.entries(opt.watch || {})) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(a) : await settle(a, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, file, args) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + file.pathname.split("/").pop(), args: args.map(String), value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(file);
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args, leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300) });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${rec.fn}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 instead of failing ----------
let lastRead = 0;
const read = async (fn, args = [], at = "purpose") => {
  const address = at === "room" ? st.room : st.purpose;
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = [], at = "purpose") => { if (!st.views[id]) { st.views[id] = { fn, at, args, when: stamp(), out: await read(fn, args, at) }; save(); } return st.views[id].out; };

// ---------- the demonstration ----------
const BOND = GEN / 10n, DIVIDEND = 5n * GEN / 100n, STAKE = BOND + DIVIDEND, FEE = 2n * GEN / 10n, UNCLEAR = BOND / 2n;
const LABEL = "Sleep tracker nights, 2025";
const PURPOSES = [
  "Academic research into sleep patterns, published only in anonymised, aggregated form",
  "Improving the accuracy of the sleep tracker app I use",
];
const USE_UNI = "A study at a university sleep lab comparing sleep length in night-shift and day-shift workers; results published as averages only";
const USE_APP = "Retraining the app's sleep-stage detection on real nights to cut misread deep sleep";
const USE_INS = "Setting health insurance premiums from how well each customer sleeps";
const USE_LATE = "Measuring how the app's new alarm changes deep sleep in its users";
const W = (...ks) => Object.fromEntries(ks.map((k) => [k, acct[k].address]));
// what a request moves for the person, by how it was read: the stake was already deposited, so the
// requester's own balance does not move; a grant pays the dividend, none pays the bond, unclear the unclear fee
const requestMoves = (who) => (j) => ({ [who]: 0n, person: j?.grant ? DIVIDEND : j?.finding === "none" ? BOND : j?.finding === "unclear" ? UNCLEAR : 0n });

await fundOnce("person", 2); await fundOnce("university", 2); await fundOnce("appmaker", 2); await fundOnce("insurer", 2); await fundOnce("stranger", 1);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(10) + " " + st.accounts[k] + "  " + ROLES[k]).join("\n           ")}\n           state ${STATE}`);

// ================================================================ 1
console.log(`\n[${stamp()}] ---- 1: deploy both contracts`);
st.purpose = st.purpose || await deploy("deployPurpose", "person", PURPOSE_FILE, []);
save();
st.room = st.room || await deploy("deployRoom", "person", ROOM_FILE, [st.purpose]);
save();
console.log(`      Purpose at ${st.purpose}\n      DataRoom at ${st.room}`);
{
  const room = await seen("roomBound", "room", [], "room");
  ok("DataRoom is bound to the Purpose address it was deployed with, and holds nothing yet", low(room.purpose) === low(st.purpose) && room.openings === 0 && room.refunds === 0 && room.paid_total === "0", JSON.stringify(room));
}

// ================================================================ 2
console.log(`\n[${stamp()}] ---- 2: PERSON's consent, in their own words, and the requesters' credit`);
{
  const k = await call("consentK1", "person", "consent", [LABEL, JSON.stringify(PURPOSES), String(DIVIDEND), String(FEE)], { watch: W("person"), expect: { person: 0n } });
  ok("PERSON consents: two purposes, a dividend of 0.05 GEN per granted request, an access fee of 0.2 GEN, no value moved", k.j?.ok === true && k.j?.purposes === 2 && k.j?.dividend === String(DIVIDEND) && k.j?.access_fee === String(FEE) && k.j?.request_bond === String(BOND) && k.j?.unclear_fee === String(UNCLEAR) && moved(k, "person", 0n), `${votes(k)}  ${k.msg.slice(0, 140)}`);
  st.K1 = k.j?.record; save();
  ok("the record id is read from the receipt", /^K\d+$/.test(st.K1 || ""), String(st.K1));
  const row = await seen("K1open", "record", [st.K1]);
  ok("record(K1): PERSON's address, the two purposes word for word, the whole price, active", low(row.person) === low(acct.person.address) && JSON.stringify(row.purposes) === JSON.stringify(PURPOSES) && row.status === "active" && row.stake === String(STAKE) && row.access_fee === String(FEE), JSON.stringify({ person: row.person, status: row.status, stake: row.stake, access_fee: row.access_fee }));
  for (const who of ["university", "appmaker", "insurer"]) {
    const d = await call("deposit_" + who, who, "deposit", [], { value: STAKE, watch: W(who), expect: { [who]: -STAKE } });
    ok(`${who.toUpperCase()} deposits 0.15 GEN of credit: the request bond and the dividend; no model runs`, d.j?.ok === true && d.j?.credit === String(STAKE) && moved(d, who, -STAKE), votes(d));
  }
}

// ================================================================ 3
console.log(`\n[${stamp()}] ---- 3: three stated uses, each read against PERSON's purposes four ways`);
{
  const uni = await call("requestUniversity", "university", "request", [st.K1, USE_UNI], { watch: W("university", "person"), expect: requestMoves("university") });
  ok("UNIVERSITY's sleep-lab study, published as averages, is found covered by purpose 1", uni.j?.finding === "1" && uni.j?.purpose === 1, `${votes(uni)}  ${uni.j?.finding || uni.msg.slice(0, 100)}`);
  ok("and a grant is stored, the 0.05 GEN dividend reaches PERSON in the same transaction, the bond stays in credit", /^G\d+$/.test(uni.j?.grant || "") && uni.j?.to_person === String(DIVIDEND) && uni.j?.credit === String(BOND) && moved(uni, "person", DIVIDEND) && moved(uni, "university", 0n), JSON.stringify(uni.delta));
  st.G_uni = uni.j?.grant; st.R_uni = uni.j?.reading; save();
  const app = await call("requestAppmaker", "appmaker", "request", [st.K1, USE_APP], { watch: W("appmaker", "person"), expect: requestMoves("appmaker") });
  ok("APPMAKER's retraining of the app's sleep-stage detection is found covered by purpose 2", app.j?.finding === "2" && app.j?.purpose === 2, `${votes(app)}  ${app.j?.finding || app.msg.slice(0, 100)}`);
  ok("and a second grant is stored, another 0.05 GEN to PERSON", /^G\d+$/.test(app.j?.grant || "") && app.j?.grant !== st.G_uni && moved(app, "person", DIVIDEND), JSON.stringify(app.delta));
  st.G_app = app.j?.grant; save();
  const ins = await call("requestInsurer", "insurer", "request", [st.K1, USE_INS], { watch: W("insurer", "person"), expect: requestMoves("insurer") });
  ok("INSURER's premium setting is found covered by no purpose: none", ins.j?.finding === "none" && ins.j?.grant === "", `${votes(ins)}  ${ins.j?.finding || ins.msg.slice(0, 100)}`);
  ok("and the insurer's 0.1 GEN bond goes to PERSON, the dividend stays in the insurer's credit", ins.j?.to_person === String(BOND) && ins.j?.credit === String(DIVIDEND) && moved(ins, "person", BOND) && moved(ins, "insurer", 0n), JSON.stringify(ins.delta));
  st.R_ins = ins.j?.reading; save();
  ok("all reading and grant ids are read from the receipts", [st.R_uni, st.R_ins].every((x) => /^R\d+$/.test(x || "")) && [st.G_uni, st.G_app].every((x) => /^G\d+$/.test(x || "")), `${st.R_uni} ${st.R_ins} ${st.G_uni} ${st.G_app}`);
  const again = await call("requestInsurerAgain", "insurer", "request", [st.K1, USE_INS], { watch: W("insurer", "person"), expect: { insurer: 0n, person: 0n } });
  ok("INSURER states the same use again: refused by its digest before any model runs, nothing taken", refused(again, "already stated this use of") && moved(again, "insurer", 0n) && moved(again, "person", 0n), `${votes(again)}  ${again.msg.slice(0, 140)}`);
  const strange = await call("revokeByStranger", "stranger", "revoke", [st.K1]);
  ok("STRANGER tries to revoke K1: refused, only the person may", refused(strange, "only the person of"), `${votes(strange)}  ${strange.msg.slice(0, 100)}`);
}

// ================================================================ 4
console.log(`\n[${stamp()}] ---- 4: the data room opens access only under a grant, at the fee K1 names`);
{
  const open = await call("openUniversity", "university", "open", [st.G_uni || "G1"], { at: "room", value: FEE, watch: W("university", "person"), expect: { university: -FEE, person: FEE } });
  ok("UNIVERSITY opens its grant: Purpose names it as the requester and names the 0.2 GEN access fee, so the room opens", open.j?.ok === true && open.j?.grant === st.G_uni && open.j?.fee === String(FEE) && open.j?.purpose === 1 && open.j?.paid_to === low(acct.person.address), `${votes(open)}  ${open.msg.slice(0, 140)}`);
  ok("and the 0.2 GEN reach PERSON in the same call", moved(open, "university", -FEE) && moved(open, "person", FEE), JSON.stringify(open.delta));
  const borrowed = await call("openInsurer", "insurer", "open", [st.G_uni || "G1"], { at: "room", value: FEE, watch: W("insurer", "person"), expect: { insurer: 0n, person: 0n } });
  ok("INSURER, which holds no grant, tries to open the university's: refused, and the 0.2 GEN come back", borrowed.j?.ok === false && String(borrowed.j?.reason).includes("was granted to another address") && borrowed.j?.returned === String(FEE) && moved(borrowed, "insurer", 0n) && moved(borrowed, "person", 0n), `${votes(borrowed)}  ${borrowed.j?.reason || borrowed.msg.slice(0, 90)}`);
  const twice = await call("openUniversityAgain", "university", "open", [st.G_uni || "G1"], { at: "room", value: FEE, watch: W("university", "person"), expect: { university: 0n, person: 0n } });
  ok("UNIVERSITY opens the same grant again: refused, a grant opens once, refunded", twice.j?.ok === false && String(twice.j?.reason).includes("was already opened here") && twice.j?.returned === String(FEE) && moved(twice, "university", 0n), `${votes(twice)}  ${twice.j?.reason || twice.msg.slice(0, 90)}`);
}

// ================================================================ 5
console.log(`\n[${stamp()}] ---- 5: PERSON revokes, the grants stand, and the requesters take back their credit`);
{
  const rv = await call("revokeK1", "person", "revoke", [st.K1]);
  ok("PERSON revokes K1; the two grants made before stand", rv.j?.ok === true && rv.j?.status === "revoked" && rv.j?.grants_stand === 2, `${votes(rv)}  ${rv.msg.slice(0, 120)}`);
  const late = await call("requestAfterRevoke", "appmaker", "request", [st.K1, USE_LATE], { watch: W("appmaker", "person"), expect: { appmaker: 0n, person: 0n } });
  ok("APPMAKER's new request on the revoked record is refused before any model runs", refused(late, "was revoked by its person") && moved(late, "appmaker", 0n), `${votes(late)}  ${late.msg.slice(0, 120)}`);
  for (const who of ["university", "appmaker", "insurer"]) {
    const held = BigInt((await seen("creditBefore_" + who, "credit", [acct[who].address])).credit || "0");
    const w = await call("withdraw_" + who, who, "withdraw", [String(held)], { watch: W(who), expect: { [who]: held } });
    ok(`${who.toUpperCase()} withdraws the ${Number(held) / 1e18} GEN of credit it has left`, w.j?.ok === true && w.j?.returned === String(held) && w.j?.credit === "0" && moved(w, who, held) && held === (who === "insurer" ? DIVIDEND : BOND), `${votes(w)}  ${w.msg.slice(0, 80)}`);
  }
}

// ================================================================ 6
console.log(`\n[${stamp()}] ---- 6: the views, the code, and the money`);
{
  const row = await seen("K1", "record", [st.K1]);
  ok("record(K1): revoked, three readings, two grants, one refused, 0.1 GEN of dividends and 0.1 GEN of bonds paid", row.status === "revoked" && row.readings === 3 && row.grants === 2 && row.refused === 1 && row.unclear === 0 && row.dividends_paid === String(2n * DIVIDEND) && row.bonds_received === String(BOND), JSON.stringify({ status: row.status, readings: row.readings, grants: row.grants, refused: row.refused }));
  const g1 = await seen("grantUni", "grant", [st.G_uni || "G1"]);
  ok("grant(university's): the university, purpose 1 in PERSON's words, the use exactly as stated, the access fee, the record now revoked", low(g1.requester) === low(acct.university.address) && g1.purpose === 1 && g1.purpose_text === PURPOSES[0] && g1.use === USE_UNI && g1.access_fee === String(FEE) && g1.record_status === "revoked" && low(g1.person) === low(acct.person.address), JSON.stringify({ requester: g1.requester, purpose: g1.purpose }));
  const g2 = await seen("grantApp", "grant", [st.G_app || "G2"]);
  ok("grant(appmaker's): the app maker, purpose 2, its use exactly as stated", low(g2.requester) === low(acct.appmaker.address) && g2.purpose === 2 && g2.use === USE_APP, JSON.stringify({ requester: g2.requester, purpose: g2.purpose }));
  const ri = await seen("readingIns", "reading", [st.R_ins || "R3"]);
  ok("reading(insurer's): none, no grant, the bond to PERSON", ri.finding === "none" && ri.grant === "" && ri.to_person === String(BOND) && ri.use === USE_INS, JSON.stringify({ finding: ri.finding, to_person: ri.to_person }));
  const page = await seen("readingsK1", "readings_of", [st.K1, 0, 20]);
  ok("readings_of(K1, 0, 20): three readings, in order", page.total === 3 && Array.isArray(page.rows) && page.rows.length === 3 && page.limit === 20, JSON.stringify(page.rows?.map((r) => r.finding)));
  const mine = await seen("grantsUni", "grants_of", [acct.university.address, 0, 20]);
  ok("grants_of(UNIVERSITY): one grant", mine.total === 1 && mine.rows?.[0]?.grant === st.G_uni, JSON.stringify(mine));
  const access = await seen("accessUni", "access", [st.G_uni || "G1"], "room");
  const tally = await seen("tallyK1", "tally", [st.K1], "room");
  const notOpened = await seen("accessApp", "access", [st.G_app || "G2"], "room");
  const order = await seen("openings", "openings", [0, 20], "room");
  ok("the room: the university's grant opened once for 0.2 GEN under purpose 1, paid to PERSON; the app maker's not opened", access.opened === true && low(access.requester) === low(acct.university.address) && low(access.paid_to) === low(acct.person.address) && access.fee === String(FEE) && access.purpose === 1 && tally.opened === 1 && tally.earned === String(FEE) && notOpened.opened === false && order.total === 1 && order.rows?.[0]?.grant === st.G_uni, JSON.stringify({ access, tally }));
  const credits = [];
  for (const k of ["university", "appmaker", "insurer"]) credits.push(await seen("credit_" + k, "credit", [acct[k].address]));
  ok("credit() is zero for every requester: nothing is left held for anybody", credits.every((c) => c.credit === "0"), JSON.stringify(credits.map((c) => c.credit)));
  const stats = await seen("stats", "stats", []);
  ok("stats(): one record, revoked, three readings, two grants, one none, nothing held", stats.records === 1 && stats.revoked === 1 && stats.readings === 3 && stats.grants === 2 && stats.none === 1 && stats.credits_held === "0" && stats.balance_owed === "0", JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules(): the two questions word for word, four askings, the combine rule, the unclear fee and the limits", rules.questions?.covers === "Which ONE numbered PURPOSE covers the STATED USE? Answer with that purpose's number, or NONE if no purpose covers it." && String(rules.questions?.beyond).startsWith("Does the STATED USE need something") && Array.isArray(rules.askings) && rules.askings.length === 4 && String(rules.compared).includes("exact string equality") && Array.isArray(rules.limits) && rules.limits.length === 3 && rules.sizes?.page === 20 && rules.sizes?.unclear_fee_atto === String(UNCLEAR), Object.keys(rules).join(","));
  ok("both contracts' own balances are zero", (await balance(st.purpose)) === 0n && (await balance(st.room)) === 0n, `${await balance(st.purpose)} / ${await balance(st.room)}`);

  st.code = {};
  for (const [key, address, file] of [["purpose", st.purpose, PURPOSE_FILE], ["room", st.room, ROOM_FILE]]) {
    const bytes = readFileSync(file);
    const chain = Buffer.from(String(await rpc("gen_getContractCode", [address])), "base64");
    st.code[key] = { address, bytes: chain.length, sha256: sha(chain), file_bytes: bytes.length, file_sha256: sha(bytes), identical: Buffer.compare(chain, bytes) === 0 };
    save();
    ok(`the code deployed at ${address} is byte for byte ${file.pathname.split("/").slice(-2).join("/")}`, st.code[key].identical, `${chain.length} bytes, sha256 ${st.code[key].sha256}`);
  }

  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  // what each account should have gained or lost, read off the receipts: a deposit takes its value
  // and a withdrawal returns it; a request pays what its receipt says to the person; an open moves
  // the fee from the opener to the person; a refused open moves nothing
  const want = Object.fromEntries(Object.keys(ROLES).map((k) => [k, 0n]));
  for (const id of st.order) {
    const s = st.steps[id], j = jsonOf(s.tries.at(-1)?.msg || "");
    if (!j?.ok) continue;
    if (s.fn === "deposit") want[s.who] -= BigInt(j.deposited);
    if (s.fn === "withdraw") want[s.who] += BigInt(j.returned);
    if (s.fn === "request") want.person += BigInt(j.to_person);
    if (s.fn === "open") { want[s.who] -= BigInt(j.fee); want.person += BigInt(j.fee); }
  }
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  ok("over the run every account ends exactly where the receipts say, PERSON 0.4 GEN up", Object.keys(want).every((k) => net(k) === want[k]) && want.person === 4n * GEN / 10n, Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18 + " (receipts " + Number(want[k]) / 1e18 + ")").join("  "));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log("Purpose:", st.purpose, " DataRoom:", st.room);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id], j = jsonOf(s.tries.at(-1)?.msg || ""); if (j?.finding) console.log(`${id.padEnd(20)} ${s.tries.map((t) => t.tx + " " + tally(t.votes)).join(" | ")}  ${j.finding} ${j.reading} ${j.grant}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
