const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const helper = require('../../utilities/helper');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const userModel = require('../../models/users/users.model');
const symptomModel = require('../../models/admin/symptoms.model');

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      let symptomData = await primary.model(constants.MODELS.symptoms , symptomModel).find({status: true}).select('_id type header_name symptom_name fill_icon unfill_icon').lean();
      return responseManager.onSuccess('All symptoms...!', symptomData , res);
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
  }
});

module.exports = router;