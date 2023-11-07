const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const productModel = require('../../models/admin/products.model');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');
const async = require('async');

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      const activeProducts = await primary.model(constants.MODELS.products , productModel).find({active: true , status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v -status').lean();
      const notActiveProducts = await primary.model(constants.MODELS.products , productModel).find({active: false , status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v -status').lean();
      let data = {
        activeProducts: activeProducts,
        notActiveProducts: notActiveProducts
      }
      return responseManager.onSuccess('All products details...!' , data , res);
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.get('/product' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        if(productData && productData != null && productData.status === true){
          return responseManager.onSuccess('Product details...!' , productData , res);
        }else{
          return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {productId , title , header_image , price , description , other_images , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(title && title.trim() != ''){
        if(header_image && header_image.trim() != ''){
          if(price && price > 0){
            if(description && description.trim() != ''){
              if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
                let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).lean();
                if(productData && productData != null && productData.status === true){
                  let obj = {
                    title: title,
                    image: header_image,
                    price: parseInt(price),
                    description: description,
                    other_images: other_images,
                    status: status,
                    updatedBy: new mongoose.Types.ObjectId(adminData._id),
                    updatedAt: new Date()
                  };
                  let updateProduct = await primary.model(constants.MODELS.products , productModel).findByIdAndUpdate(productData._id , obj , {returnOriginal: false});
                  return responseManager.onSuccess('Product details updated successfully...!' , 1 , res);
                }else{
                  return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
                }
              }else{
                let obj = {
                  title: title,
                  image: header_image,
                  price: parseInt(price),
                  description: description,
                  other_images: other_images,
                  status: status,
                  createdBy: new mongoose.Types.ObjectId(adminData._id),
                };
                let newProduct = await primary.model(constants.MODELS.products , productModel).create(obj);
                return responseManager.onSuccess('New product add successfully...!' , 1 , res);
              }
            }else{
              return responseManager.badrequest({message: 'Please provide description for product...!'} , res);
            }
          }else{
            return responseManager.badrequest({message: 'Invalid price for product, Please try again...!'} , res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid header image, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid title name for product, Please try again...!'} , res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

router.post('/productImages' , helper.authenticateToken , upload.single('productImages') , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
          let sizeOfImageInMB = helper.bytesToMB(req.file.size);
          if(sizeOfImageInMB <= 5){
            aws.saveToS3WithName(req.file.buffer , 'Products' , req.file.mimetype , 'Images').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Header image for product uploaded successfully...!' , data , res);
            }).catch((error) => {
              return responseManager.onError(error , res);
            });
          }else{
            return responseManager.badrequest({ message: 'Image file must be <= 5 MB, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again' }, res);
        }
      }else{
        return responseManager.badrequest({ message: 'Invalid file, please try again' }, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

router.post('/deleteProduct' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).lean();
        if(productData && productData != null && productData.status === true){
          let obj = {
            status: false,
            updatedBy: adminData._id,
            updatedAt: new Date()
          };
          let updateProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id , obj);
          return responseManager.onSuccess('Product deleted successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid productId to get product details, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid productId to get product details, Please try again...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

module.exports = router;