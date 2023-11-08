const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      let allProducts = await primary.model(constants.MODELS.products , productModel).find({status: true}).sort({createdAt: -1}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
      return responseManager.onSuccess('All Available products details...!' , allProducts , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
  }
});

router.post('/product' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        if(productData && productData != null){
          return responseManager.onSuccess('Product details...!' , productData , res);
        }else{
          return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, please try again...!'}, res);
  }
});

module.exports = router;