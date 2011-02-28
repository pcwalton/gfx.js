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
	var rootLayer = new Th2.Layer(canvas);
	for (var i = 0; i < FISH_COUNT; i++)
		rootLayer.children.push(new Th2.ImageLayer(fishImage));

	var renderer = new Th2.WebGLCanvasRenderer(rootLayer, canvas);
	renderer.render();
}

function main() {
	fishImage = new Image();
	fishImage.onload = imagesLoaded;
	fishImage.src = 'fish.png';
}

$(main);

