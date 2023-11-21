const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const storyMasterModel = require('../../models/admin/story.master');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {pagination , page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(pagination === true){
        await primary.model(constants.MODELS.storymasters, storyMasterModel).paginate({
          $or: [
            {category_name: {$regex: search, $options: 'i'}}
          ],
          status: true
        },{
          page,
          limit: parseInt(limit),
          select: '_id category_name description status',
          sort: {createdAt: -1},
          lean: true
        }).then((storyCategories) => {
          return responseManager.onSuccess('Story categories...!', storyCategories, res);
        }).catch((error) => {
          return responseManager.onError(error, res)
        });
      }else{
        let storyCategories = await primary.model(constants.MODELS.storymasters, storyMasterModel).find({status: true}).select('_id category_name description status').lean();
        return responseManager.onSuccess('List of story category...!' , storyCategories , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/getone', helper.authenticateToken, async (req , res) => {
  const {categoryID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(categoryID && categoryID.trim() != '' && mongoose.Types.ObjectId.isValid(categoryID)){
        let storyCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findById(categoryID).select('_id category_name description status').lean();
        if(storyCategory && storyCategory != null && storyCategory.status === true){
          return responseManager.onSuccess('Story category data...!', storyCategory, res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {categoryId , category_name , description , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(category_name && category_name.trim() != ''){
        if(categoryId && categoryId.trim() != '' && mongoose.Types.ObjectId.isValid(categoryId)){
          let storyCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findById(categoryId).lean();
          if(storyCategory && storyCategory != null && storyCategory.status === true){
            let obj = {
              category_name: category_name,
              description: (description && description.trim() != '') ? description : '',
              status: (status === true) ? status : false,
              updatedBy: new mongoose.Types.ObjectId(adminData._id),
              updatedAt: new Date()
            };
            let updateStoryCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findByIdAndUpdate(storyCategory._id , obj , {returnOriginal: false}).lean();
            return responseManager.onSuccess('Story category updated successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'}, res);
          }
        }else{
          let obj = {
            category_name: category_name,
            description: (description && description.trim() != '') ? description : '',
            status: (status === true) ? status : false,
            createdBy: new mongoose.Types.ObjectId(adminData._id)
          };
          let newStoryCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).create(obj);
          return responseManager.onSuccess('Story category added successfully...!', 1 , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid category name, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/delete' , helper.authenticateToken , async (req , res) => {
  const {categoryId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(categoryId && categoryId.trim() != '' && mongoose.Types.ObjectId.isValid(categoryId)){
        let storyCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findById(categoryId).lean();
        if(storyCategory && storyCategory != null){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            updatedAt: new Date()
          };
          let updateStoryCategory = await primary.model(constants.MODELS.storymasters, storyMasterModel).findByIdAndUpdate(storyCategory._id, obj, {returnOriginal: false}).lean();
          return responseManager.onSuccess('Story category deleted successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get story category, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;