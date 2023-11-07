const express = require('express');
const router = express.Router();

const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');


router.post('/' , async (req , res) => {
  const {email , password} = req.body;
  if(email && email.trim() != '' && password && password.trim() != ''){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findOne({email : email}).lean();
    if(admin && admin != null){
      let decPassword = await helper.passwordDecryptor(admin.password);
      if(decPassword === password){
        let accessToken = await helper.generateAccessToken({_id: admin._id});
        return responseManager.onSuccess('Admin login successfully...!',{accessToken: accessToken} , res);
      }else{
        return responseManager.badrequest({ message: 'Invalid email or password, Please try again...!' }, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid email or password, Please try again...!' }, res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid email or password, Please try again...!' }, res);
  }
});
module.exports = router;