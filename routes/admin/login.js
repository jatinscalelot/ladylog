const express = require('express');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const admminModel = require('../../models/admin/admin.model');

const router = express.Router();

router.post('/' , async (req , res) => {
  const {username , password} = req.body;
  let primary = await mongoConnection.useDb(constants.DEFAULT_DB);
  if(username && username != '' && password && password != ''){
    let admin = await primary.model(constants.MODELS.admins , admminModel).findOne({username : username}).lean();
    if(admin && admin != null){
      let decPassword = await helper.passwordDecryptor(admin.password);
      if(decPassword === password){
        await primary.model(constants.MODELS.admins , admminModel).findByIdAndUpdate(admin._id , {is_login: true});
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