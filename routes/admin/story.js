const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const storyModel = require('../../models/admin/story.model');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');

router.get('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      await primary.model(constants.MODELS.stories, storyModel).paginate({
        status: true
      }, {
        page,
        limit: parseInt(limit),
        sort: {createdAt: -1},
        lean: true
      }).then((stories) => {
        return responseManager.onSuccess('Stories data...!', stories, res);
      }).catch((error) => {
        return responseManager.onError(error, res);
      })
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{  
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {title , header , writer_name , description , other_images} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(title && title.trim() != ''){
        if(writer_name && writer_name.trim() != ''){
          if(header && header.trim() != ''){
            if(description && description.trim() != ''){
              let obj = {
                title: title,
                header: header,
                writer_name: writer_name,
                description: description,
                other_images: (other_images) ? other_images : [],
                createdBy: new mongoose.Types.ObjectId(adminData._id)
              };
              const newStory = await primary.model(constants.MODELS.stories, storyModel).create(obj);
              return responseManager.onSuccess('Story added successfully...!', 1 , res);
            }else{
              return responseManager.badrequest({message: 'Please provide description for story...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Please select image/video for story...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid writer name for story, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid title name for story, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/storyImages' , helper.authenticateToken , upload.single('storyImages') , async (req, res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype) || allowedContentTypes.videoarray.includes(req.file.mimetype)){
          let sizeOfFileInMB = helper.bytesToMB(req.file.size);
          if(sizeOfFileInMB <= 20){
            aws.saveToS3WithName(req.file.buffer, 'Stories', req.file.mimetype, 'image_video').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Image/video successfully uploaded for story...!', data , res);
            }).catch((error) => {
              return responseManager.onError(error, res);
            });
          }else{
            return responseManager.badrequest({message: 'Image/Video size must be <= 20 MB, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid file type for image/video...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Please select image/video for story...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/deleteStory' , helper.authenticateToken , async (req , res) => {
  const {storyID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(storyID && storyID != '' && mongoose.Types.ObjectId.isValid(storyID)){
        let story = await primary.model(constants.MODELS.stories, storyModel).findById(storyID).lean();
        if(story && story != null && story.status === true){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            createdAt: new Date()
          };
          const updateStory = await primary.model(constants.MODELS.stories, storyModel).findByIdAndUpdate(story._id, obj, {returnOriginal: false}).lean();
          return responseManager.onSuccess('Story deleted successfully...!', 1, res);
        }else{
          return responseManager.badrequest({message: 'Invalid storyID to get story, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid storyID to get story, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{ 
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;