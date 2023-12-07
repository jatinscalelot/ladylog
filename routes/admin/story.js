const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const storyModel = require('../../models/admin/story.model');
const storyMasterModel = require('../../models/admin/story.master'); 
const symptomModel = require('../../models/admin/symptoms.model');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      await primary.model(constants.MODELS.stories, storyModel).paginate({
        $or: [
          {author_name: {$regex: search, $options: 'i'}},
          {title: {$regex: search, $options: 'i'}},
        ]
      }, {
        page,
        limit: parseInt(limit),
        sort: {createdAt: -1},
        populate: {path: 'category' , model: primary.model(constants.MODELS.storymasters, storyMasterModel) , select: '_id category_name'},
        select: '-createdBy -updatedBy -__v -updatedAt',
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

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {storyID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(storyID && storyID != '' && mongoose.Types.ObjectId.isValid(storyID)){
        let storyData = await primary.model(constants.MODELS.stories, storyModel).findById(storyID).select('-createdBy -updatedBy -__v -updatedAt').populate({
          path: 'category',
          model: primary.model(constants.MODELS.storymasters, storyMasterModel),
          select: '_id category_name'
        }).lean();
        if(storyData && storyData != null){
          return responseManager.onSuccess('Story deleted successfully...!', storyData, res);
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

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {storyId , storyCategoryId , title , header_image , main_description , description , author_name, symptomIds , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(storyCategoryId && mongoose.Types.ObjectId.isValid(storyCategoryId)){
        let storyCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findById(storyCategoryId).lean();
        if(storyCategory && storyCategory != null && storyCategory.status === true){
          if(title && title.trim() != ''){
            if(header_image && header_image.trim() != ''){
              if(main_description && main_description.trim() != ''){
                if(description && description.trim() != ''){
                  if(author_name && author_name.trim() != ''){
                    if(status === true || status === false){
                      if(symptomIds && Array.isArray(symptomIds) && symptomIds.length > 0){
                        let result = false;
                        let newSymptomIdsArray = []
                        async.forEachSeries(symptomIds, (symptomId , next_symptomId) => {
                          (async () => {
                            if(symptomId && symptomId.trim() != '' && mongoose.Types.ObjectId.isValid(symptomId)){
                              let symptomData = await primary.model(constants.MODELS.symptoms, symptomModel).findById(symptomId).lean();
                              if(symptomData && symptomData != null && symptomData.status === true){
                                newSymptomIdsArray.push(symptomData._id);
                                result = true
                              }else{
                                result = false
                              }
                            }else{
                              return  responseManager.badrequest({message: 'Invalid ids to get symptom, Please try again...!'} , res);
                            }
                            next_symptomId();
                          })().catch((error) => {
                            console.log('error :', error);
                            return responseManager.onError(error , res);
                          });
                        } , () => {
                          (async () => {
                            if(result === true){
                              if(storyId && storyId.trim() != '' && mongoose.Types.ObjectId.isValid(storyId)){
                                let storyData = await primary.model(constants.MODELS.stories, storyModel).findById(storyId).lean();
                                if(storyData && storyData != null){
                                  let obj = {
                                    category: new mongoose.Types.ObjectId(storyCategoryId),
                                    author_name: author_name,
                                    title: title,
                                    header_image: header_image,
                                    main_description: main_description.trim(),
                                    description: description.trim(),
                                    symptomIds: newSymptomIdsArray,
                                    status: status,
                                    updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                    updatedAt: new Date()
                                  };
                                  let updatedStoryData = await primary.model(constants.MODELS.stories, storyModel).findByIdAndUpdate(storyData._id, obj, {returnOriginal: false}).lean();
                                  return responseManager.onSuccess('Story data updated successfully...!', 1, res);
                                }else{
                                  return responseManager.badrequest({message: 'Invalid id to story data, Please try again...!'}, res);
                                }
                              }else{
                                let obj = {
                                  category: new mongoose.Types.ObjectId(storyCategoryId),
                                  author_name: author_name,
                                  title: title,
                                  header_image: header_image,
                                  main_description: main_description.trim(),
                                  description: description.trim(),
                                  symptomIds: newSymptomIdsArray,
                                  status: status,
                                  createdBy: new mongoose.Types.ObjectId(adminData._id)
                                };
                                let newStory = await primary.model(constants.MODELS.stories, storyModel).create(obj);
                                return responseManager.onSuccess('Story added successfully...!' , 1 , res);
                              }
                            }else{
                              return  responseManager.badrequest({message: 'Invalid ids to get symptom, Please try again...!'} , res);
                            }
                          })().catch((error) => {
                            return responseManager.onError(error , res);
                          });
                        });
                      }else{
                        return responseManager.badrequest({message: 'Add symptoms for story...!'}, res);
                      }
                    }else{
                      return responseManager.badrequest({message: 'Invalid status, Please try again...!'}, res);
                    }
                  }else{
                    return responseManager.badrequest({message: 'Provide author name for story...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Provide desccription for story...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Provide main description for story...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Please select header image...1'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Invalid title for story, Please try again...!'} , res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
  }
});

router.post('/upload' , helper.authenticateToken , upload.single('storyImages') , async (req, res) => {
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

router.post('/changeStatus' , helper.authenticateToken , async (req , res) => {
  const {storyID , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(storyID && storyID != '' && mongoose.Types.ObjectId.isValid(storyID)){
        let story = await primary.model(constants.MODELS.stories, storyModel).findById(storyID).lean();
        if(story && story != null){
          if(status === true || status === false){
            let obj = {
              status: status,
              updatedBy: new mongoose.Types.ObjectId(adminData._id),
              createdAt: new Date()
            };
            const updateStory = await primary.model(constants.MODELS.stories, storyModel).findByIdAndUpdate(story._id, obj, {returnOriginal: false}).lean();
            return responseManager.onSuccess('Story status changed successfully...!', 1, res);
          }else{
            return responseManager.badrequest({message: 'Invalid status, Please try again...!'} , res);
          }
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