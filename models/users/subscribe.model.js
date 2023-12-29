let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let planSchema = new mongoose.Schema({
  planId: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  plan_type: {
    type: String,
    require: true
  },
  no_of_cycle: {
    type: Number,
    require: true
  },
  discount_per: {
    type: Number,
    require: true
  }
}, {_id: false}); 
let schema = new mongoose.Schema({
  paymentId: {
    type: String,
    require: true
  },
  plan: {
    type: planSchema,
    require: true,
    default: () => ({})
  },
  per_cycle_quantity: {
    type: Number,
    require: true
  },
  total_quantity: {
    type: Number,
    require: true
  },
  original_amount: {
    type: Number,
    require: true
  },
  discount: {
    type: Number,
    require: true
  },
  discounted_amount: {
    type: Number,
    require: true
  },
  size: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  address: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  remaining_cycle: {
    type: Number,
    require: true
  },
  active: {
    type: Boolean,
    default: true
  },
  buyAt: {
    type: Date,
    require: true
  },
  buyAt_timestamp: {
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