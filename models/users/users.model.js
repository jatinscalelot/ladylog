let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
	mobile: {
		type: String,
		default: ''
	},
	profile_pic: {
		type: String,
		default: ''
	},
	is_subscriber: {
		type: Boolean,
		default: false
	},
	pID: {
    type: mongoose.Types.ObjectId,
    default: null
  },
  paymentID: {
    type: String,
    default: ''
  },
  planType: {
    type: Number,
    default: 0
  },
  planName: {
    type: String,
    default: ''
  },
	is_profile_completed: {
		type: Boolean,
		default: false
	},
	fcm_token: {
		type: String,
		default: ''
	},
	channelID: {
		type: String,
		default: ''
	},
	status: {
		type: Boolean,
		default: true
	},
	is_parent: {
		type: Boolean,
		default: false
	},
	parentId: {
		type: mongoose.Types.ObjectId,
		default: null
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