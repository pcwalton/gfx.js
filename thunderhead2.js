/*
 *  thunderhead2/thunderhead2.js
 *
 *  Copyright (c) 2011 Mozilla Foundation
 *  Patrick Walton <pcwalton@mozilla.com>
 */

Th2 = (function() {
    // Exported classes and functions follow.

    var Th2 = {};

    /*
     *  Utility functions and objects
     */

    Th2.assert = function(cond, msg) {
        if (cond)
            return;
        
        try {
            throw new Error("Thunderhead2 assertion failed: " + msg);
        } catch (ex) {
            console.error(ex + " at " + ex.stack);
            throw ex;
        }
    }

    // Initializes a point from a DOM ClientRect (if supplied) or to (0, 0)
    // (otherwise).
    Th2.Point = function(clientRect) {
        if (clientRect) {
            this.x = clientRect.left;
            this.y = clientRect.top;
            return;
        }

        this.x = this.y = 0;
    }

    Th2.Rect.prototype = {
        sub: function(other) {
            this.x -= other.x;
            this.y -= other.y;
        }
    }

    /*
     *  Layers: objects that describe what to render
     */

    // The root layer class

    Th2.Layer = function(element) {
        this.children = [];

        if (!element) {
            // Choose some silly defaults.
            this.bounds = { origin: new Point, size: { width: 100, height: 100 } };
            return;
        }

        var clientRect = element.getBoundingClientRect();
        var parentClientRect = element.parentNode.getBoundingClientRect();
        var origin = new Point(clientRect).sub(parentClientRect);
        this.bounds = { origin: origin, size: clientRect };
        return;
    }

    Th2.LayerClass = function(subclass) {
        for (var key in subclass)
            this[key] = subclass[key];
    };

    Th2.Layer.prototype = Th2.LayerClass.prototype = {};

    // Image layers

    Th2.ImageLayer = function(image) {
        Th2.Layer.call(this);
        this.image = image;
    }

    Th2.ImageLayer.prototype = new Th2.LayerClass({});

    /*
     *  Renderers: objects that describe how to render the layers
     */

    // The WebGL canvas renderer

    const VERTEX_SHADER = "\n\
uniform mat4 mvpMatrix;\n\
attribute vec4 texCoord;\n\
attribute vec4 position;\n\
varying vec2 texCoord2;\n\
void main() {\n\
    gl_Position = mvpMatrix * position;\n\
    texCoord2 = texCoord.st;\n\
}\n\
";

    const FRAGMENT_SHADER = "\n\
precision highp float;\n\
uniform sampler2D sampler2d;\n\
varying vec2 texCoord2;\n\
void main() {\n\
    gl_FragColor = texture2D(sampler2d, texCoord2);\n\
}\n\
";

    const QUAD_VERTEX_POSITIONS = [
        0, 0, -5,
        1, 0, -5,
        0, 1, -5,
        1, 1, -5
    ];

    const QUAD_TEXTURE_COORDS = [
        0, 0,
        1, 0,
        0, 1,
        1, 1
    ];

    Th2.WebGLCanvasRenderer = function(rootLayer, canvas) {
        this.rootLayer = rootLayer;
        this._canvas = canvas;

        var ctx = this._ctx = canvas.getContext('experimental-webgl');
        this._buildShaders();

        var program = this._program;
        this._mvpMatrixLoc = ctx.getUniformLocation(program, 'mvpMatrix');
        this._positionLoc = ctx.getAttribLocation(program, 'position');
        this._texCoordLoc = ctx.getAttribLocation(program, 'texCoord');
        console.log("position = " + this._positionLoc + ", mvp = " +
            this._mvpMatrixLoc + ", tc = " + this._texCoordLoc);
        ctx.enableVertexAttribArray(this._positionLoc);
        ctx.enableVertexAttribArray(this._texCoordLoc);

        ctx.clearColor(0, 0, 0, 1);
        ctx.clearDepth(10000);

        ctx.enable(ctx.DEPTH_TEST);
        ctx.enable(ctx.BLEND);
        ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);

        this._buildVertexBuffers();

        var ortho = this._createOrthographicProjection(0, 1, 1, 0, .1, 1000);
        ctx.uniformMatrix4fv(this._mvpMatrixLoc, false, ortho);
    };

    Th2.WebGLCanvasRenderer.prototype = {
        // Builds the shaders and the program.
        _buildShaders: function() {
            var ctx = this._ctx;
            var vertexShader = this._createShader(ctx.VERTEX_SHADER, VERTEX_SHADER);
            var fragmentShader = this._createShader(ctx.FRAGMENT_SHADER,
                FRAGMENT_SHADER);

            var program = this._program = ctx.createProgram();
            Th2.assert(program, "couldn't create program");

            ctx.attachShader(program, vertexShader);
            ctx.attachShader(program, fragmentShader);

            ctx.linkProgram(program);
            Th2.assert(ctx.getProgramParameter(program, ctx.LINK_STATUS), {
                toString: function() {
                    return "linking failed: " + ctx.getProgramInfoLog(program);
                }
            });

            ctx.useProgram(program);
        },

        // Builds the vertex buffers.
        _buildVertexBuffers: function() {
            var ctx = this._ctx;

            var positionBuffer = this._positionBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, positionBuffer);
            ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(QUAD_VERTEX_POSITIONS), 
                ctx.STATIC_DRAW);
            ctx.vertexAttribPointer(this._positionLoc, 3, ctx.FLOAT, false, 0, 0);
        },

        // Creates an orthographic projection matrix.
        // Based on mat4.ortho() from glMatrix.js:
        //     http://code.google.com/p/glmatrix/source/browse/glMatrix.js  
        _createOrthographicProjection:
        function(left, right, bottom, top, near, far) {
            var rl = right - left, tb = top - bottom, fn = far - near;
            return [
                2/rl,               0,                  0,              0,
                0,                  2/tb,               0,              0,
                0,                  0,                  -2/fn,          0,
                -(left+right)/rl,   -(top+bottom)/tb,   -(far+near)/fn, 1
            ]
        },

        // Creates a vertex or fragment shader.
        _createShader: function(type, source) {
            var ctx = this._ctx;
            var shader = ctx.createShader(type);
            ctx.shaderSource(shader, source);
            ctx.compileShader(shader);
            Th2.assert(ctx.getShaderParameter(shader, ctx.COMPILE_STATUS), {
                toString: function() {
                    return "shader compilation failed: " +
                        ctx.getShaderInfoLog(shader);
                }
            });
            return shader;
        },

        _drawQuad: function() {
            var ctx = this._ctx;
            ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
        },

        _renderLayer: function(layer) {
            if ('initWebGL' in layer)
                layer.initWebGL(this, this._ctx);
            if ('renderViaWebGL' in layer)
                layer.renderViaWebGL(this, this._ctx);

            var children = layer.children;
            for (var i = 0; i < children.length; i++)
                this._renderLayer(children[i]);
        },

        // Renders the layer tree.
        render: function() {
            var ctx = this._ctx, program = this._program, canvas = this._canvas;
            var width = canvas.width, height = canvas.height;

            // Rendering
            ctx.viewport(0, 0, width, height);
            ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);

            var texPixels = [];
            for (var i = 0; i < 64; i++) {
                texPixels.push(Math.random() * 256);
                texPixels.push(Math.random() * 256);
                texPixels.push(Math.random() * 256);
                texPixels.push(255);
            }

            /*var texture = ctx.createTexture();
            ctx.bindTexture(ctx.TEXTURE_2D, texture);
            ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true);
            ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 8, 8, 0, ctx.RGBA,
                ctx.UNSIGNED_BYTE, new Uint8Array(texPixels));
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);*/

            var texCoords = [ 0, 0, 0, 1, 1, 0, 1, 1 ];
            var texCoordBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
            ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(texCoords),
                ctx.STATIC_DRAW);
            texCoordBuffer.itemSize = 2;
            texCoordBuffer.numItems = 4;

            ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
            ctx.vertexAttribPointer(this._texCoordLoc, texCoordBuffer.itemSize,
                ctx.FLOAT, false, 0, 0);

            /*ctx.activeTexture(ctx.TEXTURE0);
            ctx.bindTexture(ctx.TEXTURE_2D, texture);*/

            this._renderLayer(this.rootLayer);
        }
    };

    // Image layer rendering for WebGL

    // Initializes the WebGL portion of an image layer.
    Th2.ImageLayer.prototype.initWebGL = function(renderer, ctx) {
        if (this._webGL)
            return; // already done

        this._webGL = {};

        // Create the texture.
        var texture = this._webGL.texture = ctx.createTexture();
        ctx.bindTexture(ctx.TEXTURE_2D, texture);
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE,
            this.image);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);

        // Create the texture coordinate buffer
        var texCoordBuffer = ctx.createBuffer();
        ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
    }

    // How to render an image layer via WebGL
    Th2.ImageLayer.prototype.renderViaWebGL = function(renderer, ctx) {
        console.log("Rendering image layer!");
        ctx.activeTexture(ctx.TEXTURE0);
        ctx.bindTexture(ctx.TEXTURE_2D, this._webGL.texture);
        renderer._drawQuad();
    };

    return Th2;
})();

