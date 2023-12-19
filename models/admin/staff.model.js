let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
    name: {
        type: String,
        require: true
    },
    mobile: {
        type: String,
        require: true
    },
    password: {
        type: String,
        require: true
    },
    token: {
        type: String,
        default: ''
    },
    status: {
        type: Boolean,
        default: true
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