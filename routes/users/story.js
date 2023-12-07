const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const storyMasterModel = require('../../models/admin/story.master');
const storyModel = require('../../models/admin/story.model');
const userStoryModel = require('../../models/users/story.model');
const async = require('async');

// function containsObject(obj, list) {
//   return list.some(elem => elem._id.toString() === obj._id.toString());
// };

router.get('/categories' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let storyCategories = await primary.model(constants.MODELS.storymasters, storyMasterModel).find({status: true}).select('_id category_name').lean();
      return responseManager.onSuccess('Story categories...!', storyCategories , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);  
  }
});

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {storyCategoryId , page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let savedStory = await primary.model(constants.MODELS.savedstories, userStoryModel).findOne({createdBy: userData._id}).lean();
      if(storyCategoryId && storyCategoryId.trim() != '' && mongoose.Types.ObjectId.isValid(storyCategoryId)){
        let storyCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findById(storyCategoryId).lean();
        if(storyCategory && storyCategory != null && storyCategory.status === true){
          await primary.model(constants.MODELS.stories, storyModel).paginate({
            category: storyCategory._id,
            $or: [
              {title: {$regex: search, $options: 'i'}}
            ],
            status: true
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
          });
        }else{
          return responseManager.badrequest({message: 'Invalid id to get story category...!'}, res);
        }
      }else{
        await primary.model(constants.MODELS.stories, storyModel).paginate({
          $or: [
            {title: {$regex: search, $options: 'i'}}
          ],
          status: true
        }, {
          page,
          limit: parseInt(limit),
          sort: {createdAt: -1},
          populate: {path: 'category' , model: primary.model(constants.MODELS.storymasters, storyMasterModel) , select: '_id category_name'},
          select: '-createdBy -updatedBy -status -__v -updatedAt',
          lean: true
        }).then((stories) => {
          async.forEachSeries(stories.docs , (story , next_story) => {
            const exists = savedStory.story.some(val => val.toString() === story._id.toString());
            if(exists){
              story.is_save = true;
            }else{
              story.is_save = false;
            }
            next_story();
          }, () => {
            return responseManager.onSuccess('Stories data...!', stories, res);
          })
        }).catch((error) => {
          return responseManager.onError(error, res);
        });
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {storyID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let savedStory = await primary.model(constants.MODELS.savedstories, userStoryModel).findOne({createdBy: userData._id}).lean();
      if(storyID && storyID != '' && mongoose.Types.ObjectId.isValid(storyID)){
        let storyData = await primary.model(constants.MODELS.stories, storyModel).findById(storyID).select('-createdBy -updatedBy -__v -updatedAt').populate({
          path: 'category',
          model: primary.model(constants.MODELS.storymasters, storyMasterModel),
          select: '_id category_name'
        }).lean();
        if(storyData && storyData != null && storyData.status === true){
          const exists = savedStory.story.some(val => val.toString() === storyData._id.toString());
          if(exists){
            storyData.is_save = true
          }else{
            storyData.is_save = false;
          }
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

router.get('/savedStory' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let savedStoryObj = await primary.model(constants.MODELS.savedstories, userStoryModel).findOne({createdBy: userData._id}).select('story').lean();
      let savedstories = await primary.model(constants.MODELS.stories, storyModel).find({"_id": {"$in": savedStoryObj.story}}).populate({
        path: 'category',
        model: primary.model(constants.MODELS.storymasters, storyMasterModel),
        select: '_id category_name'
      }).select('-status -createdBy -updatedBy -createdAt -updatedAt').lean();
      async.forEachSeries(savedstories, (savedStory, next_savedStory) => {
        savedStory.is_save = true;
        next_savedStory();
      }, () => {
        return responseManager.onSuccess('Saved story details...!', savedstories , res);
      });
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {storyID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(storyID && storyID.trim() != null && mongoose.Types.ObjectId.isValid(storyID)){
        let storyData = await primary.model(constants.MODELS.stories, storyModel).findById(storyID).lean();
        if(storyData && storyData != null && storyData.status === true){
          let savedStory = await primary.model(constants.MODELS.savedstories, userStoryModel).findOne({createdBy: userData._id}).lean();
          if(savedStory && savedStory != null){
            const exists = savedStory.story.some(val => val.toString() === storyData._id.toString());
            if(exists){ 
              let newSavedStory = [];
              async.forEachSeries(savedStory.story , (storyId , next_storyId) => {
                if(storyId.toString() !== storyData._id.toString()){
                  newSavedStory.push(new mongoose.Types.ObjectId(storyID));
                }
                next_storyId();
              }, () => {
                (async () => {
                  let obj = {
                    story: newSavedStory,
                    status: true,
                    updatedBy: new mongoose.Types.ObjectId(userData._id),
                    updatedAt: new Date()
                  };
                  let updatedSavedStory = await primary.model(constants.MODELS.savedstories, userStoryModel).findByIdAndUpdate(savedStory._id , obj , {returnOriginal: false}).lean();
                  return responseManager.onSuccess('Story remove from saved story successfully...!' , 1 , res);
                })().catch((error) => {
                  return responseManager.onError(error , res);
                });
              });
            }else{
              let updatedStoryArray = savedStory.story;
              updatedStoryArray.push(storyData._id);
              let obj = {
                story: updatedStoryArray,
                status: true,
                updatedBy: new mongoose.Types.ObjectId(userData._id),
                updatedAt: new Date()
              };
              let updatedSavedStory = await primary.model(constants.MODELS.savedstories, userStoryModel).findByIdAndUpdate(savedStory._id , obj , {returnOriginal: false}).lean();
              return responseManager.onSuccess('Story saved successfully...!' , 1 , res);
            }
          }else{
            let obj = {
              story: [new mongoose.Types.ObjectId(storyData._id)],
              status: true,
              createdBy: new mongoose.Types.ObjectId(userData._id)
            };
            let saveStory = await primary.model(constants.MODELS.savedstories, userStoryModel).create(obj);
            return responseManager.onSuccess('Story saved successfully...!' , 1 , res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get story, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get story, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

module.exports = router;