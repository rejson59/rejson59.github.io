/* RejFile note format: safe, explicit subset of rich text. No executable HTML. */
(function () {
  'use strict';
  var MAX = 1024 * 1024, maxNodes = 10000;
  var allowed = new Set(['p','div','span','br','strong','b','em','i','u','s','strike','del','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','a']);
  var blocked = new Set(['script','style','svg','math','iframe','object','embed','form','input','textarea','button','link','meta','base','img','video','audio','canvas']);
  function safeStyle(source, target) {
    ['color','background-color','font-weight','font-style','text-decoration','text-align','font-size','font-family'].forEach(function (property) {
      var v=source.style.getPropertyValue(property).trim();
      if (!v || v.length>100 || /url\s*\(|var\s*\(|expression|[<>\\;]/i.test(v)) return;
      if(property==='font-family' && !/^[\w\s,\-'\"]{1,100}$/.test(v)) return;
      if(property==='font-size' && !/^(?:[0-9]{1,2}(?:\.[0-9]{1,2})?)(?:px|pt|em|rem|%)$/.test(v)) return;
      if(property==='text-align' && !/^(left|right|center|justify|start|end)$/.test(v)) return;
      if(property==='font-weight' && !/^(normal|bold|bolder|lighter|[1-9]00)$/.test(v)) return;
      if(property==='font-style' && !/^(normal|italic|oblique)$/.test(v)) return;
      if(property==='text-decoration' && !/^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/.test(v)) return;
      target.style.setProperty(property,v);
    });
  }
  function sanitize(html) {
    if(typeof html!=='string' || html.length>MAX) throw new Error('Notatka jest za duża (maksymalnie 1 MiB).');
    var parsed=document.createElement('template');parsed.innerHTML=html;
    var count=0, out=document.createElement('div');
    function walk(src,dst,depth) {
      if(++count>maxNodes || depth>80) throw new Error('Notatka jest zbyt złożona.');
      if(src.nodeType===Node.TEXT_NODE){dst.appendChild(document.createTextNode(src.nodeValue));return;}
      if(src.nodeType!==Node.ELEMENT_NODE)return;
      var tag=src.localName.toLowerCase(); if(blocked.has(tag))return;
      var node=allowed.has(tag) ? document.createElement(tag) : dst;
      if(node!==dst){
        safeStyle(src,node);
        if(tag==='a') {try{var u=new URL(src.getAttribute('href'));if(['https:','http:','mailto:'].includes(u.protocol) && !u.username && !u.password){node.href=u.href;node.target='_blank';node.rel='noopener noreferrer';}}catch(_) {}}
        dst.appendChild(node);
      }
      Array.from(src.childNodes).forEach(function(child){walk(child,node,depth+1);});
    }
    Array.from(parsed.content.childNodes).forEach(function(node){walk(node,out,0);});return out;
  }
  function encode(html,title) {
    var clean=sanitize(html);
    if(!clean.textContent.trim()) throw new Error('Wpisz lub wklej treść notatki.');
    var data=JSON.stringify({kind:'rejfile-note',version:1,title:String(title||'Notatka').slice(0,100),html:clean.innerHTML});
    var file=new File([data],(String(title||'Notatka').trim().replace(/[\x00-\x1f\x7f-\x9f/\\]/g,'_').slice(0,100)||'Notatka')+'.rjnote',{type:'application/json'});
    if(file.size>MAX)throw new Error('Notatka jest za duża (maksymalnie 1 MiB).');return file;
  }
  function decode(raw) {
    if(typeof raw!=='string' || raw.length>MAX)throw new Error('Notatka jest zbyt duża.');
    var data=JSON.parse(raw);
    if(!data || data.kind!=='rejfile-note' || data.version!==1 || typeof data.html!=='string' || typeof data.title!=='string') throw new Error('To nie jest poprawna notatka RejFile.');
    return {title:data.title.slice(0,100),content:sanitize(data.html)};
  }
  window.RejFileNotes={sanitize:sanitize,encode:encode,decode:decode,maxBytes:MAX};
})();
