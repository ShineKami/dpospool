import gulp from 'gulp';
import prefixer from 'gulp-autoprefixer';
import uglify from 'gulp-uglify';
import gulpSass from 'gulp-sass';
import sassCompiler from 'dart-sass';
import sourcemaps from 'gulp-sourcemaps';
import fileinclude from 'gulp-file-include';
import cssclean from 'gulp-clean-css';
import pngquant from 'imagemin-pngquant';
import imagemin from 'gulp-imagemin';
import plumber from 'gulp-plumber';
import htmlmin from 'gulp-htmlmin';
import del from 'del';
const sass = gulpSass(sassCompiler);

//project setting
const settings = {
  prjdir: '../public/',
  srcdir: 'source',
  prjext: '+(hbs|js|scss|png|jpg|jpeg|gif|ttf|woff)',
  clean: '../public'
};
//gulp set path
const path = {
  //Path for build
  build: {
    project: settings.prjdir,
    tpl: settings.prjdir+'tpl/',
    js: settings.prjdir+'assets/js/',
    css: settings.prjdir+'assets/css/',
    imgs: settings.prjdir+'assets/imgs/',
    fonts: settings.prjdir+'assets/fonts/',
  },
  //Path for resources
  src: {
    tpl: settings.srcdir+'/template/**/*.'+settings.prjext,
    js: settings.srcdir+'/js/*.'+settings.prjext,
    style: settings.srcdir+'/style/*.'+settings.prjext,
    imgs: settings.srcdir+'/imgs/**/*.'+settings.prjext,
    fonts: settings.srcdir+'/fonts/**/*.'+settings.prjext
  },
  //Path for watched files
  watch: {
    tpl: settings.srcdir+'/template/**/*.+(hbs|html)',
    js: settings.srcdir+'/js/**/*.'+settings.prjext,
    style: settings.srcdir+'/style/**/*.'+settings.prjext,
    imgs: settings.srcdir+'/imgs/**/*.'+settings.prjext,
    fonts: settings.srcdir+'/fonts/**/*.'+settings.prjext
  },
  clean: settings.clean
};


//html task(htmlmin breaks the layout)
const tplTask = () => gulp.src(path.src.tpl)
  .pipe(plumber())
  .pipe(fileinclude())
  .pipe(htmlmin({
    collapseWhitespace: true,
    ignoreCustomFragments: [/<\?[\s\S]*?\?>/]
  }))
  .pipe(gulp.dest(path.build.tpl));
export const tplDevTask = () => gulp.src(path.src.tpl)
  .pipe(plumber())
  .pipe(fileinclude())
  .pipe(gulp.dest(path.build.tpl));

//js task
const jsTask = () => gulp.src(path.src.js)
  .pipe(plumber())
  .pipe(fileinclude())
  .pipe(sourcemaps.init())
  .pipe(uglify())
  .pipe(sourcemaps.write('../js', {
    sourceMappingURL: function(file) {
      return file.relative + '.map';
    }
  }))
  .pipe(gulp.dest(path.build.js));
export const jsDevTask = () => gulp.src(path.src.js)
  .pipe(plumber())
  .pipe(fileinclude())
  .pipe(gulp.dest(path.build.js))

//style task
const styleTask = () => gulp.src(path.src.style)
  .pipe(plumber())
  .pipe(sourcemaps.init())
  .pipe(sass({errLogToConsole: true}))
  .pipe(prefixer())
  .pipe(cssclean({debug: true}, function(details) {
    console.log(details.name + ': '+ details.stats.originalSize);
    console.log(details.name + ': '+ details.stats.minifiedSize);
  }))
  .pipe(sourcemaps.write('../css', {
    sourceMappingURL: function(file) {
      return file.relative + '.map';
    }
  }))
  .pipe(gulp.dest(path.build.css));
export const styleDevTask = () => gulp.src(path.src.style)
  .pipe(plumber())
  .pipe(sass({errLogToConsole: true}))
  .pipe(prefixer())
  .pipe(gulp.dest(path.build.css));

//images task
const imgsTask = () => gulp.src(path.src.imgs)
  .pipe(plumber())
  .pipe(imagemin([pngquant({quality: [0.5, 0.5]})], {verbose: true}))
  .pipe(gulp.dest(path.build.imgs));
export const imgsDevTask = () => gulp.src(path.src.imgs)
  .pipe(plumber())
  .pipe(gulp.dest(path.build.imgs));

//Common tasks
const watchFiles = () => {
  gulp.watch(path.watch.tpl, gulp.parallel(tplDevTask));
  gulp.watch(path.watch.js, gulp.parallel(jsDevTask));
  gulp.watch(path.watch.style, gulp.parallel(styleDevTask));
  gulp.watch(path.watch.imgs, gulp.parallel(imgsDevTask));
  gulp.watch(path.watch.fonts, gulp.parallel(fontsTask));
}
const fontsTask = () => gulp.src(path.src.fonts).pipe(gulp.dest(path.build.fonts));
const copyVendorTask = () => gulp.src(path.src.fonts).pipe(gulp.dest(path.build.vendor));
export const clean = () => del([path.clean], { force: true });

//Global tasks
export const dev = gulp.series(clean, gulp.parallel(tplDevTask, jsDevTask, styleDevTask, imgsDevTask, fontsTask), watchFiles);
export const release = gulp.series(clean, gulp.parallel(tplDevTask, jsTask, styleTask, imgsTask, fontsTask))
export default dev;