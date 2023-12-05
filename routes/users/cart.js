const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const sizeMasterModel = require('../../models/admin/size.master');
const cartModel = require('../../models/users/cart.model');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      await primary.model(constants.MODELS.carts, cartModel).paginate({
        createdBy: userData._id
      }, {
        page,
        limit: parseInt(limit),
        limit: parseInt(limit),
        select: '-__v -createdBy -updatedBy -createdAt -updatedAt',
        populate: {path: 'product' , model: primary.model(constants.MODELS.products, productModel) , select: '-__v -createdBy -updatedBy -createdAt -updatedAt'},
        sort: {createdAt: -1},
        lean: true
      }).then((cartProducts) => {
        let finalData = [];
        async.forEachSeries(cartProducts.docs, (cartProduct, next_cartProduct) => {
          async.forEachSeries(cartProduct.product.productDetails, (productDetail, next_productDetail) => {
            (async () => {
              let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(productDetail.size).lean();
              cartProduct.product.productDetails
              productDetail.productsize = sizeData;
              console.log('productDetail :',productDetail);
            })().catch((error) => { });
            next_productDetail();
          }, () => {
            finalData.push(cartProduct);
            next_cartProduct();
          });
        }, () => {
          cartProducts.docs = finalData;
          return responseManager.onSuccess('Product reviews...!', cartProducts , res);
        });
      }).catch((error) => {
        return responseManager.onError(error , res);
      });
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken ,  async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
        if(productData && productData != null && productData.status === true){
          let obj = {
            product: productData._id,
            status: true,
            createdBy: userData._id
          };
          let newCart = await primary.model(constants.MODELS.carts, cartModel).create(obj);
          return responseManager.onSuccess('Product added in cart successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

module.exports = router;