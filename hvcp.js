#!/usr/bin/nodejs
//
// sample program for OMRON HVC-P
//
// HVC-C1B serial protocol
//   http://plus-sensing.omron.co.jp/product/files/HVC-C1B_%E3%82%B3%E3%83%9E%E3%83%B3%E3%83%88%E3%82%99%E4%BB%95%E6%A7%98%E6%9B%B8_A.pdf
//

var HvcP = function() {
	this.buffer = new Buffer(0);
	this.onResponse = null;
};

HvcP.prototype.connect = function(path, options, callback) {
	var args = Array.prototype.slice.call(arguments);
    callback = args.pop();
    if (typeof (callback) !== 'function') {
      callback = null;
    }

	options = options || {};
	var baudrate = options.baudrate || 921600;

	var SerialPort = require('serialport').SerialPort
	this.conn = new SerialPort(path, {
	  "baudrate": baudrate
	});
	this.conn.on('open', function() {
	  console.log('opened');
	  this.conn.on('disconnect', function(err) {
	  	console.log('disconnect...');
	  });
	  this.conn.on('error', function(err) {
	  	console.log('err...');
	  });
	  this.conn.on('data', this.onData.bind(this));
	  callback && callback();
	  // setTimeout(this.start.bind(this), 1000);
	}.bind(this));
}

HvcP.prototype.clearBuffer = function() {
	this.buffer = new Buffer(0);
}

HvcP.prototype.onData = function(data) {
	this.buffer = Buffer.concat([this.buffer, data])

	// check response header
	if (this.buffer[0] != 0xfe) {
		console.log("invalid response data...");
		this.clearBuffer();
		return;
	}

	// check payload length
	var data_len = this.buffer.readUInt32LE(2);
	var response_len = 1 + 1 + 4 + data_len;
	if (this.buffer.length < response_len) {
		// nothing to do...
		return;
	}
	else if (this.buffer.length > response_len) {
		console.log("invalid response data...");
		this.clearBuffer();
		return;
	}

	var responseCode = this.buffer.readUInt8(1);

	if (this.onResponse) {
		this.onResponse(responseCode, this.buffer.slice(6, this.buffer.length));
	}
	this.clearBuffer();
}

HvcP.prototype.sendCommand = function(buf) {
	this.clearBuffer();
	console.log('hvcc_send_cmd() : buf=' + buf.toString('hex'));
	this.conn.write(buf)
}

HvcP.prototype.getVersion = function(callback) {
	this.onResponse = function(responseCode, data) {
		var model          = data.slice(0, 12).toString();
		var majorVersion   = data.slice(12, 13).readUInt8(0);
		var minorVersion   = data.slice(13, 14).readUInt8(0);
		var releaseVersion = data.slice(15, 16).readUInt8(0);
		var revision       = data.slice(16, 20).toString('hex')

		if (callback) {
			callback(null, {
				"responseCode" : responseCode,
				"model": model,
				"majorVersion": majorVersion,
				"minorVersion": minorVersion,
				"releaseVersion": releaseVersion,
				"revision": revision
			});
		}
	};

	this.sendCommand(new Buffer('fe000000', 'hex'));
}

HvcP.prototype.setCameraOrientation = function(angle, callback) {
	this.onResponse = function(responseCode, data) {
		if (callback) {
			callback(null, {
				"responseCode": responseCode
			});
		}
	};

	var n = 0;
	if (angle == 0) {
		n = 0
	} else if (angle == 90) {
		n = 1;
	} else if (angle == 180) {
		n = 2;
	} else if (angle == 270) {
		n = 3;
	}

	var buf = new Buffer(5);
	buf[0] = 0xfe;
	buf[1] = 0x01;
	buf.writeUInt16LE(1, 2); // data length
	buf.writeUInt8(n, 4); // orientation (0-3)

	this.sendCommand(buf);
}

HvcP.prototype.parseBodyData = function(size, data) {
	var result = [];

	for (var i = 0; i < size; ++i) {
		var d = data.slice(i * 8, i * 8 + 8);
		var r = {};
		r.x          = d.readUInt16LE(0);
		r.y          = d.readUInt16LE(2);
		r.size       = d.readUInt16LE(4);
		r.confidence = d.readUInt16LE(6);

		result.push(r);
	}
	return result;
}

HvcP.prototype.parseHandData = function(size, data) {
	var result = [];

	for (var i = 0; i < size; ++i) {
		var d = data.slice(i * 8, i * 8 + 8);
		var r = {};
		r.x          = d.readUInt16LE(0);
		r.y          = d.readUInt16LE(2);
		r.size       = d.readUInt16LE(4);
		r.confidence = d.readUInt16LE(6);

		result.push(r);
	}
	return result;
}

HvcP.prototype.parseFaceData = function(size, data) {
	var result = [];

	for (var i = 0; i < size; ++i) {
		var d = data.slice(i * 31, i * 31 + 31);

		var r = {};
		r.x              = d.readInt16LE(0); 
		r.y              = d.readInt16LE(2);
		r.size           = d.readInt16LE(4);
		r.confidence     = d.readUInt16LE(6); 

		r.dir = {};
		r.dir.yaw        = d.readInt16LE(8);
		r.dir.pitch      = d.readInt16LE(10);
		r.dir.roll       = d.readInt16LE(12);
		r.dir.confidence = d.readUInt16LE(14);

		r.age = {};
		r.age.age        = d.readInt8(16);
		r.age.confidence = d.readUInt16LE(17);

		r.gen = {};
		var gen = d.readInt8(19);
		switch(gen) {
		case 0:
			r.gen.gender = 'female';
			break;
		case 1:
			r.gen.gender = 'male';
			break;
		default:
			r.gen.gender = 'unknown';
		}
		r.gen.confidence = d.readUInt16LE(20);

		r.gaze = {};
		r.gaze.gazeLR    = d.readInt8(22);
		r.gaze.gazeUD    = d.readInt8(23);

		r.blink = {};
		r.blink.ratioL   = d.readInt16LE(24);
		r.blink.ratioR   = d.readInt16LE(26);

		r.exp = {};
		var exp = d.readInt8(28);
		switch(exp) {
		case 1:
			r.exp.expression = "neutral";
			break;
		case 2:
			r.exp.expression = "happiness";
			break;
		case 3:
			r.exp.expression = "surprise";
			break;
		case 4:
			r.exp.expression = "anger";
			break;
		case 5:
			r.exp.expression = "sadness";
			break;
		default:
			r.exp.expression = "unknown";
			break;
		}
	
		r.exp.score      = d.readInt8(29);
		r.exp.degree     = d.readInt8(30);
	
		result.push(r);
	}

	return result;
}

HvcP.prototype.parseExecuteResult = function(data) {
	//
	//  detection result payload format
	//      header(4byte)
	//      body_data(8byte) * body_num
	//      hand_data(8byte) * hand_num
	//      face_data(2～31byte) * face_num
	//

	// header
	var body_num = data.readUInt8(0);
	var hand_num = data.readUInt8(1);
	var face_num = data.readUInt8(2);

	var idx = 4;
	body_data = data.slice(idx, idx + 8 * body_num);

	idx += body_data.length
	hand_data = data.slice(idx, idx + 8 * hand_num);

	idx += hand_data.length
	face_data = data.slice(idx, idx + 31 * face_num);

	result = {};
	result.body = this.parseBodyData(body_num, body_data);
	result.hand = this.parseHandData(hand_num, hand_data);
	result.face = this.parseFaceData(face_num, face_data);

	return result;
}

HvcP.prototype.detect = function(callback) {
	console.log('hccv_execute()');

	this.onResponse = function(responseCode, data) {
		console.log("hccv_execute() : responseCode = " + responseCode);

		result = this.parseExecuteResult(data);

		if (callback) {
			callback(null, {
				"responseCode": responseCode,
				"result": result
			});
		}
	};

	var buf = new Buffer(7);
	buf[0] = 0xfe;
	buf[1] = 0x03;
	buf.writeUInt16LE(3, 2); // data length
	buf.writeUInt8(0xfc, 4); // (disable body & hands detection...)
	buf.writeUInt8(0x01, 5); 
	buf.writeUInt8(0x00, 6); 

	this.sendCommand(buf);
}

module.exports = HvcP;