const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const sizeMasterModel =  require('../../models/admin/size.master');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {pagination , page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(pagination === true){
        await primary.model(constants.MODELS.sizemasters, sizeMasterModel).paginate({
          $or: [
            {size_name: {$regex: search, $options: 'i'}}
          ]
        },{
          page,
          limit: parseInt(limit),
          select: '_id size_name description status',
          sort: {createdAt: -1},
          lean: true
        }).then((sizes) => {
          return responseManager.onSuccess('Sizes data...!', sizes, res);
        }).catch((error) => {
          return responseManager.onError(error, res);
        });
      }else{
        let sizes = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).find({status: true}).select('_id size_name description status').lean();
        return responseManager.onSuccess('List of all sizes...!' , sizes , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/getone', helper.authenticateToken, async (req , res) => {
  const {sizeId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)){
        let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).select('_id size_name description status').lean();
        if(sizeData && sizeData != null){
          return responseManager.onSuccess('Size data...!', sizeData, res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {sizeId , size_name , description , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(size_name && size_name.trim() != ''){
        if(sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)){
          let size = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).lean();
          if(size && size != null){
            let obj = {
              size_name: size_name,
              description: (description && description.trim() != '') ? description : '',
              status: (status === true) ? status : false,
              updatedBy: new mongoose.Types.ObjectId(adminData._id),
              updatedAt: new Date()
            };
            let updateSize = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findByIdAndUpdate(size._id , obj , {returnOriginal: false}).lean();
            return responseManager.onSuccess('Size data updated successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
          }
        }else{
          let obj = {
            size_name: size_name,
            description: (description && description.trim() != '') ? description : '',
            status: (status === true) ? status : false,
            createdBy: new mongoose.Types.ObjectId(adminData._id)
          };
          let newSize = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).create(obj);
          return responseManager.onSuccess('Size added successfully...!' , 1 , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid size name, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/delete' , helper.authenticateToken , async (req , res) => {
  const {sizeId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)){
        let size = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).lean();
        if(size && size != null && size.status === true){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            updatedAt: new Date()
          };
          let updateSize = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findByIdAndUpdate(size._id , obj , {returnOriginal: false}).lean();
          return responseManager.onSuccess('Size deleted successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;