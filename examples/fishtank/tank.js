/*
 *	thunderhead2/examples/fishtank/tank.js
 *
 *	Copyright (c) 2011 Mozilla Foundation
 *	Patrick Walton <pcwalton@mozilla.com>
 */

const FISH_COUNT = 2000;
const FISH_SWIM_SPEED = 10;

const FORWARD_TRANSFORM = new Th2.Transform;
const BACKWARD_TRANSFORM = new Th2.Transform().translate(1, 0).scale(-1, 1);

var canvas = document.getElementById('c');
var fishImage;

function Fish() {
	var canvasWidth = canvas.width, canvasHeight = canvas.height;

	var size = Math.random() * 0.5 - 0.2;
	var width = (fishImage.width * size) | 0;
	var height = (fishImage.height * size) | 0;

	var layer = this.layer = new Th2.ImageLayer(fishImage);
	layer.bounds = new Th2.Rect((Math.random() * (canvasWidth - width)) | 0,
		(Math.random() * (canvasHeight - height)) | 0, width, height);

	this.deltaX = (Math.random() - 0.5) * FISH_SWIM_SPEED;
	this.deltaY = (Math.random() - 0.5) * FISH_SWIM_SPEED;

    this.setTransform();
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

		bounds.x = x;
		bounds.y = y;
		bounds.w = w;
		bounds.h = h;

        this.setTransform();
	},

    setTransform: function() {
        var layer = this.layer;
        if (this.deltaX < 0)
            layer.transform = FORWARD_TRANSFORM;
        else
            layer.transform = BACKWARD_TRANSFORM;
    }
};

function Controller() {
    Th2.autoresizeCanvas(canvas);
    $(window).resize(this.onResize.bind(this));

	var rootLayer = new Th2.Layer(canvas);

	var fishes = this.fishes = [];
	for (var i = 0; i < FISH_COUNT; i++) {
		var fish = new Fish;
		fishes.push(fish);
		rootLayer.children.push(fish.layer);
	}

	var renderer = this.renderer = new Th2.WebGLCanvasRenderer(canvas,
        rootLayer);
	renderer.onRender = this.onRender.bind(this);
	renderer.renderSoon();
}

Controller.prototype = {
	onRender: function() {
		var fishes = this.fishes;
		for (var i = 0; i < fishes.length; i++)
			fishes[i].swim();
		this.renderer.renderSoon();
	},

    onResize: function() {
        Th2.autoresizeCanvas(canvas);
    }
};

$(function() {
	// Load our image!
	fishImage = new Image();
	fishImage.onload = function() { new Controller; };
	fishImage.src = 'fish.png';
});

