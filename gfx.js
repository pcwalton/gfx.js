/*
 *  gfx.js/gfx.js
 *
 *  Copyright (c) 2011 Mozilla Foundation
 *  Patrick Walton <pcwalton@mozilla.com>
 */

GFX = (function() {
    // Exported classes and functions follow.

    var GFX = {};

    /*
     *  Utility functions and objects
     */

    GFX.assert = function(cond, msg) {
        if (cond)
            return;

        try {
            throw new Error("gfx.js assertion failed: " + msg);
        } catch (ex) {
            console.error(ex + " at " + ex.stack);
            throw ex;
        }
    };

    GFX.isPow2 = function(n) { return !(n & (n - 1)); };

    // Fast algorithm from:
    //
    //  http://jeffreystedfast.blogspot.com/2008/06/
    //      calculating-nearest-power-of-2.html
    GFX.nextPow2 = function(n) {
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        return n + 1;
    };

    // Resizes a canvas to fit its boundaries.
    GFX.autoresizeCanvas = function(canvas) {
        var canvasRect = canvas.getBoundingClientRect();
        var width = canvasRect.width, height = canvasRect.height;
        if (canvas.width != width)
            canvas.width = width;
        if (canvas.height != height)
            canvas.height = height;
    }

    // Bare-bones class system, just enough to get more than one level of
    // prototypical inheritance off the ground.

    GFX.Class = function() {
        return function(subclass) {
            // FIXME: Doesn't work with getters and setters.
            for (var key in subclass)
                this[key] = subclass[key];
        };
    };

    // Simple matrix class, based on glMatrix:
    //      http://code.google.com/p/glmatrix/source/browse/glMatrix.js  

    GFX.Transform = function(otherTransform) {
        this.matrix = new Float32Array(16);
        this._scratch = new Float32Array(16);
        if (otherTransform != null)
            this.copyFrom(otherTransform);
        else
            this.identity();
    };

    GFX.Transform.prototype = {
        // Combines the two transforms by multiplying this matrix by the other
        // matrix on the left.
        combine: function(otherTransform) {
            var a = this.matrix, b = otherTransform.matrix, c = this._scratch;

            for (var i = 0; i < 16; i += 4) {
                for (var j = 0; j < 4; j++) {
                    c[i+j] = b[i]   * a[j]
                           + b[i+1] * a[4+j]
                           + b[i+2] * a[8+j]
                           + b[i+3] * a[12+j];
                }
            }
 
            for (i = 0; i < 16; i++)
                a[i] = c[i];

            return this;
        },

        // Replaces the current transform with the given transform.
        copyFrom: function(otherTransform) {
            var a = this.matrix;
            for (var i = 0; i < 16; i++)
                a[i] = otherTransform.matrix[i];
            return this;
        },

        // Replaces the current transform with the identity transform.
        identity: function() {
            this.zero();
            var a = this.matrix;
            a[0] = a[5] = a[10] = a[15] = 1;
            return this;
        },

        // Replaces the current transform with an orthographic projection.
        ortho: function(left, right, bottom, top, near, far) {
            this.zero();

            var rl = right - left, tb = top - bottom, fn = far - near;
            var a = this.matrix;
            a[0] = 2/rl;
            a[5] = 2/tb;
            a[10] = -2/fn;
            a[12] = -(left+right)/rl;
            a[13] = -(top+bottom)/tb;
            a[14] = -(far+near)/fn;
            a[15] = 1;

            return this;
        },

        // Scales the current transform by the given 2D coordinate.
        scale: function(x, y) {
            var a = this.matrix;
            for (var i = 0; i < 4; i++)
                a[i] *= x;
            for (i = 4; i < 8; i++)
                a[i] *= y;
            return this;
        },

        // Transforms a 3D point by multiplying it by this matrix.
        transformPoint: function(pt, index) {
            index = index || 0;
            var a = this.matrix;
            var sx = pt[index], sy = pt[index+1], sz = pt[index+2];
            var dx = a[0]*sx + a[4]*sy + a[8]*sz + a[12];
            var dy = a[1]*sx + a[5]*sy + a[9]*sz + a[13];
            var dz = a[2]*sx + a[6]*sy + a[10]*sz + a[14];
            pt[index] = dx; pt[index+1] = dy; pt[index+2] = dz;
            return pt;
        },

        // Translates the current transform by the given 2D coordinate.
        translate: function(x, y) {
            var a = this.matrix;
            a[12] += a[0]*x + a[4]*y + a[8];
            a[13] += a[1]*x + a[5]*y + a[9];
            a[14] += a[2]*x + a[6]*y + a[10];
            a[15] += a[3]*x + a[7]*y + a[11];
            return this;
        },

        // Replaces the current transform with a zero matrix.
        zero: function() {
            var a = this.matrix;
            for (var i = 0; i < 16; i++)
                a[i] = 0;
            return this;
        }
    };

    // Simple rectangle class, vaguely Cocoa-ish

    GFX.Rect = function(x, y, w, h) {
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

    /*
     *  Layers: objects that describe what to render
     */

    // The root layer class

    GFX.Layer = function(element) {
        this.children = [];
        if (element)
            this.bounds = new GFX.Rect(element.getBoundingClientRect());
    }

    GFX.LayerClass = new GFX.Class;
    GFX.Layer.prototype = GFX.LayerClass.prototype = {};

    // Image layers

    GFX.ImageLayer = function(image) {
        GFX.Layer.call(this);
        this.image = image;
        this.bounds = new GFX.Rect(image);
    }

    GFX.ImageLayer.prototype = new GFX.LayerClass({});

    /*
     *  Renderers: objects that describe how to render the layers
     */

    // Basic functionality common to all renderers.

    const VENDOR_PREFIXES = [ 'moz', 'webkit', 'o', 'ms' ];

    GFX.Renderer = function() {
        this._renderCallback = this._renderCallback.bind(this);
    }

    GFX.RendererClass = new GFX.Class;

    GFX.RendererClass.prototype = {
        // This horrible thing avoids creating a new closure on every render.
        _renderCallback: function() { this.render(); },

        // Schedules a render operation at the next appropriate opportunity.
        // Use this method whenever you've made a change that doesn't
        // automatically trigger rendering.
        renderSoon: function() {
            if (this._needsRender)
                return;
            this._needsRender = true;

            if (!this.renderSoon._rafName) {
                if (window.requestAnimationFrame) {
                    this.renderSoon._rafName = 'requestAnimationFrame';
                } else {
                    // Sigh...
                    for (var i = 0; i < VENDOR_PREFIXES.length; i++) {
                        var name = VENDOR_PREFIXES[i] + 'RequestAnimationFrame';
                        if (window[name]) {
                            this.renderSoon._rafName = name;
                            break;
                        }
                    }
                }
            }

            this.self = this;
            window[this.renderSoon._rafName](this._renderCallback);
        }
    };

    // The WebGL canvas renderer

    const VERTEX_SHADER = "\n\
uniform mat4 mvpMatrix;\n\
attribute vec2 texCoord;\n\
attribute vec4 position;\n\
varying vec2 texCoord2;\n\
void main() {\n\
    gl_Position = mvpMatrix * position;\n\
    texCoord2 = texCoord;\n\
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

    const POSITION_BUFFER = {
        data: '_positionBufferData',
        index: '_positionBufferIndex'
    };

    const TEX_COORD_BUFFER = {
        data: '_texCoordBufferData',
        index: '_texCoordBufferIndex'
    };

    GFX.WebGLCanvasRenderer = function(canvas, rootLayer) {
        GFX.Renderer.call(this);

        this.rootLayer = rootLayer;
        this._canvas = canvas;

        this._mvpMatrix = new GFX.Transform();

        // Stack of matrices - basically a free list to avoid accumulating
        // garbage when rendering.
        this._matrixStack = [];
        this._matrixStack.size = 0;

        this._imageTextureCache = {};

        var ctx = this._ctx = canvas.getContext('experimental-webgl');
        this._buildShaders();

        var program = this._program;
        this._transformMatrixLoc = ctx.getUniformLocation(program,
            'transformMatrix');
        this._mvpMatrixLoc = ctx.getUniformLocation(program, 'mvpMatrix');
        this._positionLoc = ctx.getAttribLocation(program, 'position');
        this._texCoordLoc = ctx.getAttribLocation(program, 'texCoord');
        ctx.enableVertexAttribArray(this._positionLoc);
        ctx.enableVertexAttribArray(this._texCoordLoc);

        ctx.clearColor(0, 0, 0, 1);

        ctx.enable(ctx.BLEND);
        ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);

        this._buildVertexBuffers();
    };

    GFX.WebGLCanvasRenderer.prototype = new GFX.RendererClass({
        // Allocates space for @count values in one of the buffers
        // (POSITION_BUFFER or TEX_COORD_BUFFER), resizing the buffer if
        // necessary.
        _allocBuffer: function(bufferType, count) {
            var data = this[bufferType.data];
            var index = this[bufferType.index];

            if (data.length >= index + count)
                return index;

            // Scale up by a power of two.
            var newLength = GFX.nextPow2(index + count);
            var newData = new Float32Array(newLength);
            for (var i = 0; i < data.length; i++)
                newData[i] = data[i];
            this[bufferType.data] = newData;

            return index;
        },

        // Builds the shaders and the program.
        _buildShaders: function() {
            var ctx = this._ctx;
            var vertexShader = this._createShader(ctx.VERTEX_SHADER,
                VERTEX_SHADER);
            var fragmentShader = this._createShader(ctx.FRAGMENT_SHADER,
                FRAGMENT_SHADER);

            var program = this._program = ctx.createProgram();
            GFX.assert(program, "couldn't create program");

            ctx.attachShader(program, vertexShader);
            ctx.attachShader(program, fragmentShader);

            ctx.linkProgram(program);
            GFX.assert(ctx.getProgramParameter(program, ctx.LINK_STATUS), {
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
            ctx.vertexAttribPointer(this._positionLoc, 3, ctx.FLOAT, false, 0,
                0);

            this._positionBufferData = new Float32Array(16);
            this._positionBufferIndex = 0;

            var texCoordBuffer = this._texCoordBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
            ctx.vertexAttribPointer(this._texCoordLoc, 2, ctx.FLOAT, false, 0,
                0);

            this._texCoordBufferData = new Float32Array(16);
            this._texCoordBufferIndex = 0;
        },

        // Creates or reuses a texture for the given image.
        _createImageTexture: function(image, mipmap) {
            var key = mipmap + ':' + image.src;
            if (key in this._imageTextureCache)
                return this._imageTextureCache[key];

            var width = image.width, height = image.height;
            var widthScale, heightScale;
            if (mipmap && (!GFX.isPow2(width) || !GFX.isPow2(height))) {
                // Resize up to the next power of 2.
                var canvas2d = document.createElement('canvas');
                var textureWidth = canvas2d.width = GFX.nextPow2(width);
                var textureHeight = canvas2d.height = GFX.nextPow2(height);
                widthScale = width / textureWidth;
                heightScale = height / textureHeight;

                var ctx2d = canvas2d.getContext('2d');
                ctx2d.drawImage(image, 0, 0);
                image = canvas2d;

                console.log("size: " + textureWidth + " / " + textureHeight);
            } else {
                widthScale = heightScale = 1;
            }

            var ctx = this._ctx;
            var texture = ctx.createTexture();
            ctx.bindTexture(ctx.TEXTURE_2D, texture);
            ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA,
                ctx.UNSIGNED_BYTE, image);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S,
                ctx.CLAMP_TO_EDGE);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T,
                ctx.CLAMP_TO_EDGE);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER,
                ctx.LINEAR);

            if (mipmap) {
                ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER,
                    ctx.LINEAR_MIPMAP_LINEAR);
                ctx.generateMipmap(ctx.TEXTURE_2D);
            } else {
                ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER,
                    ctx.LINEAR);
            }

            return (this._imageTextureCache[key] = {
                texture: texture,
                widthScale: widthScale,
                heightScale: heightScale
            });
        },

        // Writes quad coordinates given by @bounds and @z into @pts starting
        // at index @n. If @flipped is true, flips the coordinates
        // left-to-right (this is basically only useful for the fish tank demo,
        // sadly).
        _createQuadCoords: function(pts, n, z, bounds, flipped) {
            var x1 = bounds.x, y1 = bounds.y;
            var x2 = x1 + bounds.w, y2 = y1 + bounds.h;

            if (flipped) {
                var tmp = x2;
                x2 = x1;
                x1 = tmp;
            }

            pts[n + 0*3 + 0] = pts[n + 1*3 + 0] = pts[n + 4*3 + 0] = x1;
            pts[n + 0*3 + 1] = pts[n + 2*3 + 1] = pts[n + 3*3 + 1] = y1;
            pts[n + 2*3 + 0] = pts[n + 3*3 + 0] = pts[n + 5*3 + 0] = x2;
            pts[n + 1*3 + 1] = pts[n + 4*3 + 1] = pts[n + 5*3 + 1] = y2;

            for (var i = 0; i < 18; i += 3) {
                pts[n + i + 2] = z;

                if (this._matrix)
                    this._matrix.transformPoint(pts, i);
            }
        },

        // Creates a vertex or fragment shader.
        _createShader: function(type, source) {
            var ctx = this._ctx;
            var shader = ctx.createShader(type);
            ctx.shaderSource(shader, source);
            ctx.compileShader(shader);
            GFX.assert(ctx.getShaderParameter(shader, ctx.COMPILE_STATUS), {
                toString: function() {
                    return "shader compilation failed: " +
                        ctx.getShaderInfoLog(shader);
                }
            });
            return shader;
        },

        // Writes the texture coordinates [ (0,0), (0,@h), (@w,0), (@w,0),
        // (0,@h), (@w,@h) ] into @buf starting at @i.
        _createTextureCoords:
        function(buf, i, w, h) {
            buf[i] = buf[i+1] = buf[i+2] = buf[i+5] = buf[i+7] = buf[i+8] = 0;
            buf[i+4] = buf[i+6] = buf[i+10] = w;
            buf[i+3] = buf[i+9] = buf[i+11] = h;
        },

        // Sends the commands to the graphics card and flushes the buffers.
        _flush: function() {
            var ctx = this._ctx;
            ctx.bindBuffer(ctx.ARRAY_BUFFER, this._positionBuffer);
            ctx.bufferData(ctx.ARRAY_BUFFER, this._positionBufferData,
                ctx.STREAM_DRAW);
            ctx.bindBuffer(ctx.ARRAY_BUFFER, this._texCoordBuffer);
            ctx.bufferData(ctx.ARRAY_BUFFER, this._texCoordBufferData,
                ctx.STREAM_DRAW);

            // TODO: drawElements (indexed) is faster.
            var objectCount = this._positionBufferIndex / 3;
            ctx.drawArrays(ctx.TRIANGLES, 0, objectCount);

            this._positionBufferIndex = this._texCoordBufferIndex = 0;
        },

        _renderLayer: function(layer) {
            if ('initWebGL' in layer)
                layer.initWebGL(this, this._ctx);

            // If this layer has a transform, apply it and save the old matrix.
            var matrixStack = this._matrixStack;
            if (layer.transform) {
                // We use a stack of matrices to avoid generating garbage.

                if (matrixStack[matrixStack.size]) {
                    var oldMatrix = matrixStack[matrixStack.size++];
                    oldMatrix.copyFrom(this._matrix);
                } else {
                    oldMatrix = new GFX.Transform(transform);
                    matrixStack.push(oldMatrix);
                    matrixStack.size++;
                }

                this._matrix = layer.transform;
            }

            if (layer.webGLTextureInfo) {
                // Add the appropriate position and texture coordinates to the
                // buffers we're building up.

                var textureInfo = layer.webGLTextureInfo;

                // TODO: we shouldn't be doing _allocBuffer here; delegate to
                // the _createFooCoords() methods.

                var index = this._allocBuffer(POSITION_BUFFER, 6*3);
                this._createQuadCoords(this._positionBufferData, index, -5,
                    layer.bounds, layer.flipped);
                this._positionBufferIndex += 6*3;

                index = this._allocBuffer(TEX_COORD_BUFFER, 6*2);
                this._createTextureCoords(this._texCoordBufferData, index,
                    textureInfo.widthScale, textureInfo.heightScale);
                this._texCoordBufferIndex += 6*2;
            } else {
                // TODO: flush
            }

            var children = layer.children;
            for (var i = 0; i < children.length; i++)
                this._renderLayer(children[i]);

            // Restore the old matrix.
            if (layer.transform)
                this._matrix = matrixStack[--matrixStack.size];
        },

        // Renders the layer tree.
        render: function() {
            this._needsRender = false;
            if (this.onRender)
                this.onRender();

            var ctx = this._ctx, program = this._program;
            var canvas = this._canvas;
            var width = canvas.width, height = canvas.height;

            var ortho = this._mvpMatrix.ortho(0, width, height, 0, .1, 1000);
            ctx.uniformMatrix4fv(this._mvpMatrixLoc, false, ortho.matrix);

            ctx.viewport(0, 0, width, height);
            ctx.clear(ctx.COLOR_BUFFER_BIT);

            this._renderLayer(this.rootLayer);

            this._flush();
        }
    });

    // Image layer rendering for WebGL

    // Initializes the WebGL portion of an image layer.
    GFX.ImageLayer.prototype.initWebGL = function(renderer, ctx) {
        if (this.webGLTextureInfo)
            return; // already done

        var mipmap = this.mipmap;
        if (mipmap == null) {
            var image = this.image, bounds = this.bounds;
            var scale = Math.min(bounds.w / image.width, bounds.h /
                image.height);
            mipmap = scale < 0.75;
        }

        this.webGLTextureInfo = renderer._createImageTexture(this.image,
            mipmap);
    };

    /*
     *  DOM renderer
     */

    GFX.DOMRenderer = function() {
    }

    return GFX;
})();

