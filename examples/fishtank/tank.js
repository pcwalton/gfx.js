/*
 *	thunderhead2/examples/fishtank/tank.js
 *
 *	Copyright (c) 2011 Mozilla Foundation
 *	Patrick Walton <pcwalton@mozilla.com>
 */

const FISH_COUNT = 5;

var fishImage;

function imagesLoaded() {
	var canvas = $('#c')[0];
	var width = canvas.width, height = canvas.height;

	var rootLayer = new Th2.Layer(canvas);
	for (var i = 0; i < FISH_COUNT; i++) {
		var fishLayer = new Th2.ImageLayer(fishImage);
		fishLayer.bounds.x = (Math.random() * width) | 0;
		fishLayer.bounds.y = (Math.random() * height) | 0;
		rootLayer.children.push(fishLayer);
	}

	var renderer = new Th2.WebGLCanvasRenderer(rootLayer, canvas);
	renderer.render();
}

function main() {
	fishImage = new Image();
	fishImage.onload = imagesLoaded;
	fishImage.src = 'fish.png';
}

$(main);

