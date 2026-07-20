// game.js — Click Challenge v1.7
// TODO: remove debug notes before prod - hope i dont forget

(() => {
  const TARGET = 500;
  const TIME_LIMIT = 10000;

  const elTime = document.getElementById("time");
  const elScore = document.getElementById("score");
  const elMsg = document.getElementById("msg");
  const elFlag = document.getElementById("flag");

  const btn = document.getElementById("btn");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");

  let score = 0;
  let running = false;
  let startAt = 0;
  let timer = null;

  // they will never win even if they use an autoclicker! HAHAHA
  const HARD_CAP = 120;

  function fmt(ms) {
    return (ms / 1000).toFixed(2);
  }

  function setMsg(s) {
    elMsg.textContent = s;
  }

  function reset() {
    score = 0;
    running = false;
    startAt = 0;
    clearInterval(timer);
    timer = null;

    elScore.textContent = "0";
    elTime.textContent = fmt(TIME_LIMIT);
    btn.disabled = true;
    setMsg("Press Start when ready.");
    elFlag.textContent = "(locked)";
  }

  function tick() {
    const elapsed = Date.now() - startAt;
    const left = Math.max(0, TIME_LIMIT - elapsed);
    elTime.textContent = fmt(left);

    if (left <= 0) endGame();
  }

  function start() {
    if (running) return;
    running = true;
    startAt = Date.now();
    btn.disabled = false;
    setMsg("Go!");
    timer = setInterval(tick, 25);
  }

  function endGame() {
    running = false;
    btn.disabled = true;
    clearInterval(timer);
    timer = null;

    if (score >= TARGET) {
      setMsg("Winner! (…but where's the prize?)");
    } else {
      setMsg(`Time's up. Score: ${score}/${TARGET}. NICE TRY 🤣. Maybe try Inspect instead of clicking? 😉`);
    }
  }

  function click() {
    if (!running) return;

    if (score < HARD_CAP) score++;
    elScore.textContent = String(score);

    if (score === HARD_CAP) {
      setMsg("hmm... why did it stop? 🤔");
    }
  }

  function getSalt() {
    const m = document.querySelector('meta[name="build-salt"]');
    return m ? m.content : "";
  }

  const _enc = [
    0, 29, 126, 103, 84, 65, 214, 216, 226, 243, 136, 155, 180,
    178, 190, 187, 13, 19, 74, 42, 46, 203, 41, 200, 44, 11
  ];

  function showFlag() {
    if (localStorage.getItem("uw_dev") !== "1") return;

    const salt = getSalt();
    if (!salt) { setMsg("missing config?"); return; }

    const keyStr = build() + "|" + salt;
    const out = [];

    for (let i = 0; i < _enc.length; i++) {
      const kb = (keyStr.charCodeAt(i % keyStr.length) + (i * 13)) & 0xff;
      out.push(_enc[i] ^ kb);
    }

    elFlag.textContent = String.fromCharCode(...out);
  }

  // this is so i dont have to click 500 times myself :D
  // devtools console: _dev("token")
  const a1 = [87, 72];
  const a2 = [50, 48];
  const a3 = [50, 54];
  const b1 = [95, 68, 69];
  const b2 = [66, 85, 71];
  const c  = [95, 77, 69, 33];

  function build() {
    // i always forget the numbers but the code converts it so easily zzz
    return String.fromCharCode(...a1, ...a2, ...a3, ...b1, ...b2, ...c);
  }

  function validate(x) {
    return typeof x === "string" && x === build();
  }

  window._dev = function(token) {
    if (validate(token)) {
      localStorage.setItem("uw_dev", "1");
      showFlag();
      setMsg("⚡ DEV MODE ACTIVATED. DEV = GOD basically! ⚡");
      return true;
    }
    setMsg("Invalid token.");
    return false;
  };

  btn.addEventListener("click", click);
  startBtn.addEventListener("click", start);
  resetBtn.addEventListener("click", reset);

  reset();
})();