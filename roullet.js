let items = ["1등", "2등", "3등", "4등", "5등", "6등"];
let canvas, ctx;
let angle = 0;
let spinning = false;

window.onload = () => {
  canvas = document.getElementById("wheel");
  ctx = canvas.getContext("2d");
  drawWheel();
};

function addItems() {
  const input = document.getElementById("items").value;
  if (input) items = input.split(",");
  drawWheel();
}

function shuffleItems() {
  items.sort(() => Math.random() - 0.5);
  drawWheel();
}

function drawWheel() {
  const arc = (2 * Math.PI) / items.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  items.forEach((item, i) => {
    const startAngle = i * arc + angle;
    ctx.beginPath();
    ctx.fillStyle = `hsl(${i * (360 / items.length)}, 70%, 50%)`;
    ctx.moveTo(canvas.width/2, canvas.height/2);
    ctx.arc(canvas.width/2, canvas.height/2, canvas.width/2, startAngle, startAngle + arc);
    ctx.fill();

    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(startAngle + arc / 2);
    ctx.fillStyle = "#fff";
    ctx.font = "20px bold Pretendard";
    ctx.fillText(item, canvas.width/4, 10);
    ctx.restore();
  });
}

function spin() {
  if (spinning) return;
  spinning = true;
  let spinTime = 3000 + Math.random() * 2000;
  let spinAngle = Math.random() * 360 + 720;

  let start = Date.now();
  let animate = () => {
    let now = Date.now();
    let elapsed = now - start;
    let progress = elapsed / spinTime;
    if (progress < 1) {
      angle += (spinAngle * (1 - progress)) / 50;
      drawWheel();
      requestAnimationFrame(animate);
    } else {
      spinning = false;
      showResult();
    }
  };
  animate();
}

function showResult() {
  const arc = (2 * Math.PI) / items.length;
  const index = Math.floor(((2 * Math.PI - (angle % (2 * Math.PI))) / arc)) % items.length;
  document.getElementById("result").textContent = `🎉 당첨: ${items[index]} 🎉`;
}

function reset() {
  angle = 0;
  drawWheel();
}

function openBig() {
  window.open("big.html", "_blank", "width=800,height=800");
}
