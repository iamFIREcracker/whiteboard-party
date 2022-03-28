const MARKER_SIZE = 5;
const ERASER_SIZE = 60;
const ZOOM = 0.0005;
const SYNTHETIC_ZOOM_DELTA = 500;

const COLORS = {
  black: "#212529",
  blue: "#0d6efd",
  green: "#198754",
  red: "#dc3545",
  gray: "#ced4da",
  white: "#e9ecef",
};
const OUTLINES = {
  'black': 'dark',
  'blue': 'primary',
  'green': 'success',
  'red': 'danger',
};
let ACTION = 'drawing';
let COLOR = 'black';
document.getElementById("marker").checked = true;

let OFFSCREEN = null;

if (window.matchMedia('(min-width: 768px)').matches) {
  document.querySelectorAll(`.btn-group`).forEach(e => {
    e.classList.add('btn-group-lg');
  });
}

if (localStorage.getItem("infoModalSeen") !== "20220327.KVWVOR2VMI") {
  localStorage.setItem("infoModalSeen", "20220327.KVWVOR2VMI");
  const modal = new bootstrap.Modal(document.getElementById("infoModal"), {});
  modal.show();
}

const sketch = function (
  p5,
  width = 4000 || p5.windowWidth,
  height = 2000 || p5.windowHeight
) {
  let socket = null;
  let counter = 1;
  let state = {};
  let lshape = null;
  let drag;
  let view = {
    x: width / 2 - p5.windowWidth / 2,
    y: height / 2 - p5.windowHeight / 2,
    w: p5.windowWidth,
    h: p5.windowHeight,
  };
  let tview = { ...view };
  let needsDraw = false;

  p5.setup = function () {
    socket = io();
    socket.on("connect", function () {
      console.log("Connected");
      clear();
    });
    socket.on("disconnect", function () {
      console.log("Disconnected");
    });
    socket.on("init", function (event) {
      console.log("init");
      for (const rshape of event.undo) {
        add(rshape);
      }
      state.redo = event.redo;
    });
    socket.on("draw", function (rshape) {
      add(rshape);
      if (lshape && rshape.i === lshape.i) {
        lshape = null;
      }
      state.redo = [];
    });
    socket.on("undo", function () {
      undo();
    });
    socket.on("redo", function () {
      redo();
    });
    socket.on("clear", function () {
      clear();
    });

    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    OFFSCREEN = p5.createGraphics(width, height);
  };

  p5.draw = function () {
    if (!needsDraw) return;

    needsDraw = false;

    if (isViewMoving(view, tview)) {
      view.x = p5.lerp(view.x, tview.x, 0.075);
      view.y = p5.lerp(view.y, tview.y, 0.075);
      view.w = p5.lerp(view.w, tview.w, 0.075);
      view.h = p5.lerp(view.h, tview.h, 0.075);
      needsDraw = true;
    }

    p5.background(COLORS[COLOR]);

    // p5.image(
    //   OFFSCREEN,
    //   // destination
    //   0, 0, p5.windowWidth, p5.windowHeight,
    //   // source
    //   view.x, view.y, view.w, view.h,
    // );
    p5.image(
      OFFSCREEN,
      -view.x / scale(),
      -view.y / scale(),
      width / scale(),
      height / scale(),
    );

    if (lshape) {
      drawShape(
        {
          ...lshape,
          p: lshape.p.map(globalToLocal),
        },
        p5
      );
    }

    if (isErasing() && lshape) {
      const c = COLORS.gray;
      const size = ERASER_SIZE;
      p5.noStroke();
      p5.fill(c);
      p5.ellipse(
        p5.mouseX,
        p5.mouseY,
        size / scale(),
        size / scale(),
      );
    }
  };

  if (isTouchDevice()) {
    p5.touchStarted = function (event) {
      if (event.target !== p5.canvas) return;
      console.log("touchstart", ACTION);
      if (isDrawing() || isErasing()) inputStarted(p5.touches[0].x, p5.touches[0].y);
      else if (isPanning()) dragStarted(p5.touches[0].x, p5.touches[0].y);
      event.preventDefault(); // Disable scrolling
    };

    p5.touchMoved = function (event) {
      if (event.target !== p5.canvas) return;
      if (isDrawing() || isErasing()) inputMoved(p5.touches[0].x, p5.touches[0].y);
      else if (isPanning()) dragMoved(p5.touches[0].x, p5.touches[0].y);
      event.preventDefault(); // Disable scrolling
    };

    p5.touchEnded = function (event) {
      if (event.target !== p5.canvas) return;
      console.log("touchend", ACTION);
      if (isDrawing() || isErasing()) inputEnded();
      else if (isPanning()) dragEnded();
      event.preventDefault(); // Disable scrolling
    };
  }
  p5.mousePressed = function (event) {
    if (event.target !== p5.canvas) return;
    if (event.button === 2) return;
    console.log("mousepress", ACTION);
    if (isDrawing() || isErasing()) inputStarted(p5.mouseX, p5.mouseY);
    else if (isPanning()) dragStarted(p5.mouseX, p5.mouseY);
  };

  p5.mouseDragged = function (event) {
    if (event.target !== p5.canvas) return;
    if (!lshape && !drag)
      // Right click, inspect, winds up firing a `mouseDragged` event.
      // But we would not have neither a `lshape` nor `drag` object to
      // complete the action with, so we blindly skip the event.
      return;
    if (isDrawing() || isErasing()) inputMoved(p5.mouseX, p5.mouseY);
    else if (isPanning()) dragMoved(p5.mouseX, p5.mouseY);
  };

  p5.mouseReleased = function (event) {
    if (event.target !== p5.canvas) return;
    console.log("mouserelease", ACTION);
    if (isDrawing() || isErasing()) inputEnded();
    else if (isPanning()) dragEnded();
  };

  p5.mouseWheel = function (event) {
    zoom(p5.mouseX, p5.mouseY, event.delta);
  };

  document.getElementById("handles").addEventListener("click", panClicked);
  document.getElementById("btn-zoom-in").addEventListener("click", zoomInClicked);
  document.getElementById("menu-zoom-in").addEventListener("click", zoomInClicked);
  document.getElementById("btn-zoom-out").addEventListener("click", zoomOutClicked);
  document.getElementById("menu-zoom-out").addEventListener("click", zoomOutClicked);
  document.getElementById("marker").addEventListener("click", markerClicked);
  document.getElementById("black").addEventListener("click", colorChanged);
  document.getElementById("blue").addEventListener("click", colorChanged);
  document.getElementById("green").addEventListener("click", colorChanged);
  document.getElementById("red").addEventListener("click", colorChanged);
  document.getElementById("eraser").addEventListener("click", eraserClicked);
  document.getElementById("btn-clear").addEventListener("click", clearClicked);
  document.getElementById("menu-clear").addEventListener("click", clearClicked);
  document.getElementById("undo").addEventListener("click", undoClicked);
  document.getElementById("redo").addEventListener("click", redoClicked);
  document.getElementById("new").addEventListener("click", newClicked);
  document.getElementById("btn-export").addEventListener("click", exportClicked);
  document.getElementById("menu-export").addEventListener("click", exportClicked);

  function panClicked() {
    console.log('switching to panning');
    ACTION = 'panning';
    needsDraw = true; // to wipe out the eraser shade that might be on the canvas
  }

  function zoomOutClicked() {
    zoom(p5.windowWidth / 2, p5.windowHeight / 2, SYNTHETIC_ZOOM_DELTA);
  }

  function zoomInClicked() {
    zoom(p5.windowWidth / 2, p5.windowHeight / 2, -SYNTHETIC_ZOOM_DELTA);
  }

  function markerClicked() {
    console.log('switching to drawing');
    ACTION = 'drawing';
    needsDraw = true; // to wipe out the eraser shade that might be on the canvas
  }

  function eraserClicked() {
    console.log('switching to erasing');
    ACTION = 'erasing';
    needsDraw = true;
  }

  function colorChanged(element) {
    const prevOutlineClass = `btn-outline-${OUTLINES[COLOR]}`;
    COLOR = element.target.id;
    const outlineClass = `btn-outline-${OUTLINES[COLOR]}`;
    document.querySelectorAll(`.${prevOutlineClass}`).forEach(e => {
      e.classList.remove(prevOutlineClass);
      e.classList.add(outlineClass);
    });
    document.getElementById("marker").checked = true;
    markerClicked();
    needsDraw = true;
  }

  function clearClicked() {
    if (state.undo.length) {
      clear();
      socket.emit("clear");
    }
  }

  function undoClicked() {
    if (state.undo.length) {
      socket.emit("undo");
    }
  }

  function redoClicked() {
    if (state.redo.length) {
      socket.emit("redo");
    }
  }

  function newClicked() {
    generateRoomAndReload();
  }

  function exportClicked() {
    const name = `WhiteboardParty-${location.pathname.substring(1)}`;
    p5.saveCanvas(OFFSCREEN, name, "png");
  }

  function isTouchDevice() {
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  }

  function inputStarted(x, y) {
    lshape = {
      i: `${socket.id}-${counter++}`,
      c: ACTION === "drawing" ? COLOR : 'white',
      p: [],
    };
    inputMoved(x, y);
  }

  function inputMoved(x, y) {
    lshape.p.push(localToGlobal({ x, y }));
    needsDraw = true;
  }

  function inputEnded() {
    if (lshape.p.length > 1) {
      socket.emit("draw", { ...lshape });
    } else {
      lshape = null;
    }
  }

  function dragStarted(x, y) {
    drag = {
      prev: { x, y },
    };
  }

  function dragMoved(x, y) {
    tview.x -= (x - drag.prev.x) * scale();
    tview.y -= (y - drag.prev.y) * scale();
    drag.prev.x = x;
    drag.prev.y = y;
    needsDraw = true;
  }

  function dragEnded() {
    drag = null;
  }

  function zoom(cx, cy, delta) {
    if (delta > 0) {
      //zoom out
      let n = delta;
      while (n-- >= 0) {
        if (tview.w > (4 * width) || tview.h > (4 * height)) break;
        tview.w = tview.w * (ZOOM + 1);
        tview.h = tview.h * (ZOOM + 1);
      }
    } else {
      // zoom in
      let n = -delta;
      while (n-- >= 0) {
        if (tview.w < (width / 12) || tview.h < (height / 12)) break;
        tview.w = tview.w / (ZOOM + 1);
        tview.h = tview.h / (ZOOM + 1);
      }
    }

    // What does `p5.mouseX` currently points to?
    //
    //     x = view.x + (p5.mouseX / p5.windowWidth) * view.w
    //
    // While zooming, we don't want to change what `p5.mouseX` currently
    // points at, or otherwise the _camera_ would move.  This means
    // the the following should be true as well:
    //
    //     x = tview.x + (p5.mouseX / p5.windowWidth) * tview.w
    //
    // `x` is known from the first equation, `tview.w` we just
    // calculated it inside the previous block; all we have to do
    // is figure out `tview.x`:
    //
    //     x = view.x + (p5.mouseX / p5.windowWidth) * view.w
    //     x = tview.x + (p5.mouseX / p5.windowWidth) * tview.w
    //     ----------------------------------------------------
    //     0 = view.x - tview.x + (p5.mouseX / p5.windowWidth) * (view.w - tview.w)
    //     ----------------------------------------------------
    //     tview.x = view.x + (p5.mouseX / p5.windowWidth) * (view.w - tview.w)
    tview.x = view.x + (cx / p5.windowWidth) * (view.w - tview.w);
    tview.y = view.y + (cy / p5.windowHeight) * (view.h - tview.h);
    needsDraw = true;
  }

  function add(rshape) {
    drawShape(rshape, OFFSCREEN);
    state.undo.push(rshape);
    needsDraw = true;
  }

  function redraw() {
    OFFSCREEN.background(COLORS.white);
    for (const lshape of state.undo) {
      drawShape(lshape, OFFSCREEN);
    }
    needsDraw = true;
  }

  function undo() {
    if (state.undo.length === 0) return;

    state.redo.push(state.undo.pop());
    redraw();
  }

  function redo() {
    if (state.redo.length === 0) return;

    add(state.redo.pop());
  }

  function clear() {
    state.undo = [];
    state.redo = [];
    redraw();
  }

  function drawShape(shape, renderer) {
    const { c, p } = shape;
    let weight = c === 'white' ? ERASER_SIZE : MARKER_SIZE;
    if (renderer === p5) { // TODO figure out a better way?!
      weight /= (view.w / p5.windowWidth);
    }

    draw();

    function draw() {
      renderer.strokeWeight(weight);
      renderer.stroke(COLORS[c]);
      renderer.noFill();
      renderer.beginShape();
      for (const { x, y } of p) {
        renderer.curveVertex(x, y);
      }
      renderer.endShape();
    }
  }

  function scale() {
    return view.w / p5.windowWidth;
  }

  function localToGlobal(p) {
    return {
      x: view.x + (p.x / p5.windowWidth) * view.w,
      y: view.y + (p.y / p5.windowHeight) * view.h,
    };
  }

  function globalToLocal(p) {
    return {
      x: ((p.x - view.x) / view.w) * p5.windowWidth,
      y: ((p.y - view.y) / view.h) * p5.windowHeight,
    };
  }
};
new p5(sketch);

function isViewMoving(view, tview) {
  return ((Math.abs(view.x - tview.x) > 1e-2)
          || (Math.abs(view.y - tview.y) > 1e-2)
          || (Math.abs(view.w - tview.w) > 1e-2)
          || (Math.abs(view.h - tview.h) > 1e-2))
}

function isPanning() {
  return ACTION === "panning";
}

function isDrawing() {
  return ACTION === "drawing";
}

function isErasing() {
  return ACTION === "erasing";
}
