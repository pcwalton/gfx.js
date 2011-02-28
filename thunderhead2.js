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

    // Simple matrix class, based on glMatrix:
    //      http://code.google.com/p/glmatrix/source/browse/glMatrix.js  

    Th2.Matrix = function(otherMatrix) {
        if (otherMatrix == null)
            return;

        var a = this.array = [];
        for (var i = 0; i < 16; i++)
            a[i] = otherMatrix.array[i];
    }

    Th2.Matrix.prototype = {
        // Replaces the current matrix with the identity matrix.
        identity: function() {
            this.array = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ];
            return this;
        },

        // Replaces the current matrix with an orthographic projection.
        ortho: function(left, right, bottom, top, near, far) {
            var rl = right - left, tb = top - bottom, fn = far - near;
            this.array = [
                2/rl,               0,                  0,              0,
                0,                  2/tb,               0,              0,
                0,                  0,                  -2/fn,          0,
                -(left+right)/rl,   -(top+bottom)/tb,   -(far+near)/fn, 1
            ];
            return this;
        },

        // Scales the current matrix by the given 2D coordinates.
        scale: function(x, y) {
            var a = this.array;
            for (var i = 0; i < 4; i++)
                a[i] *= x;
            for (i = 4; i < 8; i++)
                a[i] *= y;
        },

        // Translates the current matrix by the given 2D coordinates.
        translate: function(x, y) {
            var a = this.array;
            a[12] += a[0]*x + a[4]*y + a[8];
            a[13] += a[1]*x + a[5]*y + a[9];
            a[14] += a[2]*x + a[6]*y + a[10];
            a[15] += a[3]*x + a[7]*y + a[11];
            return this;
        }
    };

    // Simple rectangle class, vaguely Cocoa-ish

    Th2.Rect = function(x, y, w, h) {
        if (typeof(x) === 'object') {
            // Initialize from a DOM object (ClientRect, perhaps).
            this.x = x.left || 0;
            this.y = x.top || 0;
            this.w = x.width || 0;
            this.h = x.height || 0;
            return;
        }

        this.x = x; this.y = y; this.w = w; this.h = h;
    };

    Th2.Rect.prototype = {
        // Returns a *snapshot* of the current origin of this rect.
        get origin()    { return { x: this.x, y: this.y }; },
        // Returns a *snapshot* of the current size of this rect.
        get size()      { return { w: this.w, h: this.h }; }
    };

    /*
     *  Layers: objects that describe what to render
     */

    // The root layer class

    Th2.Layer = function(element) {
        this.children = [];
        if (element)
            this.bounds = new Th2.Rect(element.getBoundingClientRect());
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
        this.bounds = new Th2.Rect(image);
    }

    Th2.ImageLayer.prototype = new Th2.LayerClass({});

    /*
     *  Renderers: objects that describe how to render the layers
     */

    // The WebGL canvas renderer

    const VERTEX_SHADER = "\n\
uniform mat4 transformMatrix;\n\
uniform mat4 mvpMatrix;\n\
attribute vec4 texCoord;\n\
attribute vec4 position;\n\
varying vec2 texCoord2;\n\
void main() {\n\
    gl_Position = transformMatrix * mvpMatrix * position;\n\
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
        this._transformMatrixLoc = ctx.getUniformLocation(program,
            'transformMatrix');
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

        var ortho = new Th2.Matrix().ortho(0, 1, 1, 0, .1, 1000);
        ctx.uniformMatrix4fv(this._mvpMatrixLoc, false, ortho.array);

        this._matrix = new Th2.Matrix().identity();
        this._reloadMatrix();
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

            var texCoordBuffer = this._texCoordBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
            ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(QUAD_TEXTURE_COORDS),
                ctx.STATIC_DRAW);
            ctx.vertexAttribPointer(this._texCoordLoc, 2, ctx.FLOAT, false, 0, 0);
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

        // Sets the OpenGL matrix (our vertex shader's matrix, really) to the value
        // of @_matrix.
        _reloadMatrix: function() {
            console.log("setting " + this._transformMatrixLoc + " to " +
                this._matrix.array.toSource());
            this._ctx.uniformMatrix4fv(this._transformMatrixLoc, false,
                this._matrix.array);
        },

        _renderLayer: function(layer) {
            if ('initWebGL' in layer)
                layer.initWebGL(this, this._ctx);

            var matrix = this._matrix;
            var oldMatrix = new Th2.Matrix(matrix);
            //matrix.translate(layer.bounds.origin);
            matrix.scale(layer.bounds.size);
            this._reloadMatrix();

            if ('renderViaWebGL' in layer)
                layer.renderViaWebGL(this, this._ctx);

            var children = layer.children;
            for (var i = 0; i < children.length; i++)
                this._renderLayer(children[i]);

            this._matrix = oldMatrix;
        },

        // Renders the layer tree.
        render: function() {
            var ctx = this._ctx, program = this._program, canvas = this._canvas;
            var width = canvas.width, height = canvas.height;

            ctx.viewport(0, 0, width, height);
            ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);

            this._matrix.identity();
            this._reloadMatrix();

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

