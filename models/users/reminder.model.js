let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
    reminder: {
        type: mongoose.Types.ObjectId,
        require: true
    },
    reminder_on: {
        type: Boolean,
        require: true
    },
    repeat: {
        type: String,
        enum: ['no_repeat' , 'daily' , 'weekly'],
        require: true
    },
    reminder_time: {
        type: String,
        require: true
    },
    reminder_start: {
        type: Number,
        require: true
    },
    reminder_end: {
        type: Number,
        default: 0
    },
    note: {
        type: String,
        require: true
    },
	createdBy: {
		type: mongoose.Types.ObjectId,
		default: null
	},
	updatedBy: {
		type: mongoose.Types.ObjectId,
		default: null
	}
}, { timestamps: true, strict: false, autoIndex: true });
schema.plugin(mongoosePaginate);
module.exports = schema;