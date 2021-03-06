/*
 *  gfx.js/examples/fishtank/tank.js
 *
 *  Copyright (c) 2011 Mozilla Foundation
 *  Patrick Walton <pcwalton@mozilla.com>
 */

const FISH_COUNT = 200;
const FISH_SWIM_SPEED = 10;
const FISH_MAX_SIZE = 0.5;
const FISH_MIN_SIZE = 0.2;

var canvas;
var backgroundImage, fishImage;

var frameCount = 0;
var frameStart = new Date().getTime();

function Fish() {
    var canvasWidth = canvas.width, canvasHeight = canvas.height;

    var size = Math.random() * (FISH_MAX_SIZE - FISH_MIN_SIZE) + FISH_MIN_SIZE;
    var width = (fishImage.width * size) | 0;
    var height = (fishImage.height * size) | 0;

    var layer = this.layer = new GFX.ImageLayer(fishImage);
    layer.bounds = new GFX.Rect((Math.random() * (canvasWidth - width)) | 0,
        (Math.random() * (canvasHeight - height)) | 0, width, height);

    this.deltaX = (Math.random() - 0.5) * FISH_SWIM_SPEED;
    this.deltaY = (Math.random() - 0.5) * FISH_SWIM_SPEED;

    this.layer.flipped = this.deltaX < 0;
}

Fish.prototype = {
    swim: function() {
        var canvasWidth = canvas.width, canvasHeight = canvas.height;

        var bounds = this.layer.bounds;
        var x = bounds.x + this.deltaX;
        var y = bounds.y + this.deltaY;
        var w = bounds.w, h = bounds.h;

        if ((x < 0 && this.deltaX < 0) ||
                (x > canvasWidth - w && this.deltaX > 0))
            this.deltaX = -this.deltaX;
        if ((y < 0 && this.deltaY < 0) ||
                (y > canvasHeight - h && this.deltaY > 0))
            this.deltaY = -this.deltaY;

        this.layer.flipped = this.deltaX > 0;

        bounds.x = x;
        bounds.y = y;
        bounds.w = w;
        bounds.h = h;
    }
};

function Controller() {
    var self = this;
    function onRender() { self.onRender(); }
    function onResize() { self.onResize(); }

    GFX.autoresizeCanvas(canvas);
    $(window).resize(onResize);

    var rootLayer = new GFX.Layer(canvas);

    var backgroundLayer = this.backgroundLayer =
        new GFX.ImageLayer(backgroundImage);
    this.resizeBackgroundLayer();
    rootLayer.children.push(backgroundLayer);

    var fishes = this.fishes = [];
    for (var i = 0; i < FISH_COUNT; i++) {
        var fish = new Fish;
        fishes.push(fish);
        rootLayer.children.push(fish.layer);
    }

    var renderer = new GFX.WebGLCanvasRenderer(canvas, rootLayer);
    //var renderer = new GFX.DOMRenderer(canvas, rootLayer);
    this.renderer = renderer;
    renderer.onRender = onRender;
    renderer.renderSoon();
}

Controller.prototype = {
    onRender: function() {
        frameCount++;
        if (new Date().getTime() >= frameStart + 1000) {
            console.log("fps " + frameCount);
            frameStart = new Date().getTime();
            frameCount = 0;
        }

        this.resizeBackgroundLayer();

        var fishes = this.fishes;
        for (var i = 0; i < fishes.length; i++)
            fishes[i].swim();
        this.renderer.renderSoon();
    },

    onResize: function() {
        GFX.autoresizeCanvas(canvas);
    },

    // TODO: maybe we should have a kind of layout manager for this?
    resizeBackgroundLayer: function() {
        this.backgroundLayer.bounds = new GFX.Rect(0, 0, canvas.width,
            canvas.height);
    }
};

$(function() {
    canvas = $('#c')[0];

    var nLoaded = 0;
    function loaded() {
        if (++nLoaded == 2)
            new Controller;
    }

    // Load our images!
    fishImage = new Image();
    fishImage.onload = loaded;
    fishImage.src = 'fish.png';

    backgroundImage = new Image();
    backgroundImage.onload = loaded;
    backgroundImage.src = 'background-flip2.jpg';
});

