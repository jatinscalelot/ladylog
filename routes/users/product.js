const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const reviewModel = require('../../models/users/review.model');
const sizeMasterModel = require('../../models/admin/size.master');
const cartModel = require('../../models/users/cart.model');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      primary.model(constants.MODELS.products, productModel).paginate({
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
            let productVariants = await primary.model(constants.MODELS.veriants, veriantModel).find({product: product._id , status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').populate({
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
          let productVariants = await primary.model(constants.MODELS.veriants, veriantModel).find({product: productData._id , status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').populate({
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

router.post('/veriant' , helper.authenticateToken , async (req , res) => {
  const {veriantId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      if(veriantId && veriantId.trim() != '' && mongoose.Types.ObjectId.isValid(veriantId)){
        let veriantData = await primary.model(constants.MODELS.veriants , veriantModel).findById(veriantId).populate([
          {path: 'product' , model: primary.model(constants.MODELS.products, productModel) , select: '-createdBy -updatedBy -createdAt -updatedAt -__v'},
          {path: 'size' , model: primary.model(constants.MODELS.sizemasters, sizeMasterModel) , select: '_id size_name'},
        ]).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        if(veriantData && veriantData != null && veriantData.status === true){
          let cartProductsData = await primary.model(constants.MODELS.carts, cartModel).findOne({createdBy: userData._id , status: true}).lean();
          if(cartProductsData && cartProductsData != null){
            if(cartProductsData.cart_products.length > 0){
              const cartProductsArray = cartProductsData.cart_products;
              const existInCartProductsArray = cartProductsArray.some(val => val.toString() === veriantData._id.toString());
              if(existInCartProductsArray){
                let data = {
                  is_cart: true
                };
                return responseManager.onSuccess('veriant data...!' , data , res);
              }else{
                let data = {
                  is_cart: false
                };
                return responseManager.onSuccess('veriant data...!' , data , res);
              }
            }else{
              let data = {
                  is_cart: false
                };
              return responseManager.onSuccess('veriant data...!' , data , res);
            }
          }else{
            let data = {
                  is_cart: false
                };
            return responseManager.onSuccess('veriant data...!' , data , res);
          }
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