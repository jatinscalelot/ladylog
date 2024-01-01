let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
	period_start_date: {
		type: Date,
		require: true
	},
	period_start_date_timestamp: {
		type: Number,
		require: true
	},
	period_end_date: {
		type: Date,
		require: true
	},
	period_end_date_timestamp: {
		type: Number,
		require: true
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