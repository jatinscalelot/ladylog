const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const userModel = require('../../models/users/users.model');

router.get('/' , helper.authenticateToken ,  async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(admin && admin != null){
      const page = req.body.page;
      const limit = req.body.limit;
      let allUsers = await primary.model(constants.MODELS.users , userModel).find({is_profile_completed: true}).select('_id name mobile cycle period_days period_start_date period_end_date').limit(limit).skip(limit * page).sort({createdAt: -1}).lean();
      return responseManager.onSuccess('All user details...!' , allUsers , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
  }
});

module.exports = router;