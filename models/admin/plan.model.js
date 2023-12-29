let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
  plan_type: {
    type: String,
    enum: ['silver' , 'gold' , 'premium'],
    require: true
  },
  plan_name: {
    type: String,
    require: true
  },
  no_of_cycle: {
    type: Number,
    require: true
  },
  discount_per: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
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