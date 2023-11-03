const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');

router.post('/profilePic' , helper.authenticateToken , upload.single('profile_pic')  , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
          aws.saveToS3(req.file.buffer , userData._id.toString() , req.file.mimetype , 'profiles').then((result) => {
            let data = {
              path: result.data.Key,
              updatedAt: new Date(),
              updatedBy: new mongoose.Types.ObjectId(userData._id)
            };
            (async () => {
              const updateUser = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(userData._id , data , {returnOriginal: false});
              return responseManager.onSuccess('User profile updated successfully...!' , 1 , res);
            })().catch((error) => { 
              return responseManager.onError(error , res);
            });
          }).catch((error) => {
            return responseManager.onError(error , res);
          });
        }else{
          return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again' }, res);
        }
      }else{
        return responseManager.badrequest({ message: 'Invalid file to update user profile pic, please try again' }, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
  }
});

module.exports = router;