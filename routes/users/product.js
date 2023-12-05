const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const variantModel = require('../../models/admin/variants.model');
const reviewModel = require('../../models/users/review.model');
const sizeMasterModel = require('../../models/admin/size.master');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      await primary.model(constants.MODELS.products, productModel).paginate({
        $or: [
          {title: {$regex: search, $options: 'i'}}
        ],
        status: true
      }, {
        page,
        limit: parseInt(limit),
        select: '-createdBy -updatedBy -createdAt -updatedAt -__v',
        sort: {createdAt: -1},
        lean: true
      }).then((products) => {
        async.forEachSeries(products.docs, (product, next_product) => {
          (async () => {
            let productVariants = await primary.model(constants.MODELS.variants, variantModel).find({product: product._id , status: true}).select('-product -status -createdBy -updatedBy -createdAt -updatedAt -__v').populate({
              path: 'size',
              model: primary.model(constants.MODELS.sizemasters, sizeMasterModel),
              select: '_id size_name'
            }).lean();
            product.productDetails = productVariants;
            let noofreview = parseInt(await primary.model(constants.MODELS.reviews, reviewModel).countDocuments({product: product._id}));
            if(noofreview > 0){
              let totalReviewsCountObj = await primary.model(constants.MODELS.reviews, reviewModel).aggregate([{$match: {product: product._id}} , {$group: {_id: null , sum: {$sum: '$rating'}}}]);
              if(totalReviewsCountObj && totalReviewsCountObj.length > 0 && totalReviewsCountObj[0].sum){
                product.ratings = parseFloat((totalReviewsCountObj[0].sum / noofreview).toFixed(1));
              }else{
                product.ratings = 0.0
              }
            }else{
              product.ratings = 0.0;
            }
            next_product();
          })().catch((error) => { });
        }, () => {
          return responseManager.onSuccess('Products details...!', products, res);
        });
      }).catch((error) => {
        return responseManager.onError(error , res);
      });
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        if(productData && productData != null && productData.status === true){
          let productVariants = await primary.model(constants.MODELS.variants, variantModel).find({product: productData._id}).select('-product -status -createdBy -updatedBy -createdAt -updatedAt -__v').populate({
            path: 'size',
            model: primary.model(constants.MODELS.sizemasters, sizeMasterModel),
            select: '_id size_name'
          }).lean();
          productData.productDetails = productVariants;
          let noofreview = parseInt(await primary.model(constants.MODELS.reviews, reviewModel).countDocuments({product: productData._id}));
          if(noofreview > 0){
            let totalReviewsCountObj = await primary.model(constants.MODELS.reviews, reviewModel).aggregate([{$match: {product: productData._id}} , {$group: {_id: null , sum: {$sum: '$rating'}}}]);
            if(totalReviewsCountObj && totalReviewsCountObj.length > 0 && totalReviewsCountObj[0].sum){
              productData.ratings = parseFloat((totalReviewsCountObj[0].sum / noofreview).toFixed(1));
            }else{
              productData.ratings = 0.0
            }
          }else{
            productData.ratings = 0.0;
          }
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