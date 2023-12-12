const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const reviewModel = require('../../models/users/review.model');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {productId , page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
        if(productData && productData != null){
          await primary.model(constants.MODELS.reviews, reviewModel).paginate({
            product: productData._id
          }, {
            page,
            limit: parseInt(limit),
            limit: parseInt(limit),
            select: '-updatedBy -updatedAt -__v',
            populate: {path: 'createdBy' , model: primary.model(constants.MODELS.users, userModel) , select: '-_id name profile_pic'},
            sort: {createdAt: -1},
            lean: true
          }).then((reviews) => {
            return responseManager.onSuccess('Product reviews...!', reviews, res);
          }).catch((error) => {
            return responseManager.onError(error , res);
          })
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {productId , rating , description} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
        if(productData && productData != null && productData.status === true){
          if(rating >= 0 && rating <= 5){
            let obj = {
              product: new mongoose.Types.ObjectId(productData._id),
              rating: rating,
              description: (description && description.trim() != '') ? description : '',
              createdBy: new mongoose.Types.ObjectId(userData._id)
            };
            let review = await primary.model(constants.MODELS.reviews, reviewModel).create(obj);
            return responseManager.onSuccess('Review added successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid rating, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid toke to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid toke to get user, Please try again...!'}, res);
  }
});

module.exports = router;