//draws main title
function drawTitle(ctx, time, isShadow, maxExtrude, extraShadow) {
	ctx.strokeStyle = (!!isShadow) ? colors.red.patternEdge : colors.red.brighter;
	ctx.lineWidth = 16;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";

	if (extraShadow) {
		ctx.shadowBlur = 40 * MAX_PIXEL_RATIO;
		ctx.shadowColor = "rgba(0,0,0,0.4)";
		ctx.shadowOffsetX = ctx.shadowOffsetY = 10 * MAX_PIXEL_RATIO;
	} else {
		ctx.shadowColor = "rgba(0,0,0,0)";
	}

	var t = titleTimer;
	for (var lineI = 0; lineI < titleLines.length; lineI++) {
		var thisLine = titleLines[lineI];
		var lineT = clamp01(t * thisLine.speed - thisLine.offset);
		var extrude = clamp01(t);
		extrude *= 5;
		if (maxExtrude !== undefined) {
			extrude = Math.min(extrude, maxExtrude);
		}
		ctx.beginPath();
		for (var subLineI = 0; subLineI < thisLine.line.length; subLineI++) {
			var thisSubLine = thisLine.line[subLineI];
			var subLineT = clamp01(lineT * (thisLine.line.length - 1) - subLineI + 1);
			if (subLineT > 0) {
				if (subLineT == 1) {
					if (subLineI === 0 && thisSubLine.length == 2) {
						ctx.moveTo(thisSubLine[0] - extrude, thisSubLine[1] - extrude);
					} else if (thisSubLine.length == 2) {
						ctx.lineTo(thisSubLine[0] - extrude, thisSubLine[1] - extrude);
					} else if (thisSubLine.length == 6) {
						ctx.bezierCurveTo(
							thisSubLine[0] - extrude,
							thisSubLine[1] - extrude,
							thisSubLine[2] - extrude,
							thisSubLine[3] - extrude,
							thisSubLine[4] - extrude,
							thisSubLine[5] - extrude,
						);
					}
				} else {
					var lastLine = thisLine.line[subLineI - 1];
					var lastPos = [lastLine[lastLine.length - 2], lastLine[lastLine.length - 1]];
					if (thisSubLine.length == 2) {
						ctx.lineTo(
							lerp(lastPos[0], thisSubLine[0], subLineT) - extrude,
							lerp(lastPos[1], thisSubLine[1], subLineT) - extrude,
						);
					} else if (thisSubLine.length == 6) {
						var p0 = lastPos;
						var p1 = [thisSubLine[0], thisSubLine[1]];
						var p2 = [thisSubLine[2], thisSubLine[3]];
						var p3 = [thisSubLine[4], thisSubLine[5]];
						var p4 = lerpA(p0, p1, subLineT);
						var p5 = lerpA(p1, p2, subLineT);
						var p6 = lerpA(p2, p3, subLineT);
						var p7 = lerpA(p4, p5, subLineT);
						var p8 = lerpA(p5, p6, subLineT);
						var p9 = lerpA(p7, p8, subLineT);
						ctx.bezierCurveTo(
							p4[0] - extrude,
							p4[1] - extrude,
							p7[0] - extrude,
							p7[1] - extrude,
							p9[0] - extrude,
							p9[1] - extrude,
						);
					}
				}
			}
		}
		ctx.stroke();
	}
}

//draws blocks on ctx
function drawBlocks(ctx, blocks, checkViewport) {
	var t2;
	for (var i = 0; i < blocks.length; i++) {
		var block = blocks[i];
		if (
			checkViewport &&
			(
				block.x < camPos[0] - VIEWPORT_RADIUS ||
				block.x > camPos[0] + VIEWPORT_RADIUS ||
				block.y < camPos[1] - VIEWPORT_RADIUS ||
				block.y > camPos[1] + VIEWPORT_RADIUS
			)
		) {
			//outside viewport, don't render this block
		} else {
			if (block.animDelay > 0) {
				block.animDelay -= deltaTime;
			} else {
				block.animProgress += deltaTime * block.animDirection * 0.003;
			}
			if (block.animProgress > 1) {
				block.animDirection = 0;
				block.animProgress = 1;
			}
			if (block.animProgress < 0) {
				block.currentBlock = block.nextBlock;
				block.animDirection = 1;
				block.animProgress = 0;
			} else {
				var t = block.animProgress;

				//edge
				if (block.currentBlock === 0) {
					ctx.fillStyle = colors.red.boundsDark;
					ctx.fillRect(block.x * 10, block.y * 10, 10, 10);
					if (!uglyMode) {
						linesCtx.fillStyle = colors.grey.diagonalLines;
						linesCtx.fillRect(block.x * 10, block.y * 10, 10, 10);
					}
				}
				//empty block
				if (block.currentBlock == 1) {
					//shadow edge
					if (t > 0.8 && !uglyMode) {
						ctx.fillStyle = colors.grey.darker;
						ctx.fillRect(block.x * 10 + 2, block.y * 10 + 2, 7, 7);
					}

					//bright surface
					ctx.fillStyle = colors.grey.brighter;
					if (t == 1 || uglyMode) {
						// ctx.fillStyle = colors.grey.darker; //shadow edge
						// ctx.beginPath();
						// ctx.moveTo(block.x*10 + 1, block.y*10 + 8);
						// ctx.lineTo(block.x*10 + 2, block.y*10 + 9);
						// ctx.lineTo(block.x*10 + 9, block.y*10 + 9);
						// ctx.lineTo(block.x*10 + 9, block.y*10 + 2);
						// ctx.lineTo(block.x*10 + 8, block.y*10 + 1);
						// ctx.fill();
						ctx.fillRect(block.x * 10 + 1, block.y * 10 + 1, 7, 7);
					} else if (t < 0.4) {
						t2 = t * 2.5;
						ctx.beginPath();
						ctx.moveTo(block.x * 10 + 2, block.y * 10 + lerp(9, 2, t2));
						ctx.lineTo(block.x * 10 + 2, block.y * 10 + 9);
						ctx.lineTo(block.x * 10 + lerp(2, 9, t2), block.y * 10 + 9);
						ctx.fill();
					} else if (t < 0.8) {
						t2 = t * 2.5 - 1;
						ctx.beginPath();
						ctx.moveTo(block.x * 10 + 2, block.y * 10 + 2);
						ctx.lineTo(block.x * 10 + 2, block.y * 10 + 9);
						ctx.lineTo(block.x * 10 + 9, block.y * 10 + 9);
						ctx.lineTo(block.x * 10 + 9, block.y * 10 + lerp(9, 2, t2));
						ctx.lineTo(block.x * 10 + lerp(2, 9, t2), block.y * 10 + 2);
						ctx.fill();
					} else {
						t2 = t * 5 - 4;
						// ctx.fillStyle = colors.grey.darker; //shadow edge
						// ctx.beginPath();
						// ctx.moveTo(block.x*10 + lerp(2,1,t2), block.y*10 + lerp(9,8,t2));
						// ctx.lineTo(block.x*10 + 2, block.y*10 + 9);
						// ctx.lineTo(block.x*10 + 9, block.y*10 + 9);
						// ctx.lineTo(block.x*10 + 9, block.y*10 + 2);
						// ctx.lineTo(block.x*10 + lerp(9,8,t2), block.y*10 + lerp(2,1,t2));
						// ctx.fill();
						ctx.fillRect(block.x * 10 + lerp(2, 1, t2), block.y * 10 + lerp(2, 1, t2), 7, 7);
					}
				}
				//regular colors
				if (block.currentBlock >= 2) {
					var idForBlockSkinId = (block.currentBlock - 2) % SKIN_BLOCK_COUNT;
					var thisColor = getColorForBlockSkinId(idForBlockSkinId);

					var isPatternBlock = block.currentBlock > SKIN_BLOCK_COUNT + 1;

					var brightColor = isPatternBlock ? thisColor.pattern : thisColor.brighter;
					var darkColor = isPatternBlock ? thisColor.patternEdge : thisColor.darker;

					//shadow edge
					if (t > 0.8 && !uglyMode) {
						ctx.fillStyle = darkColor;
						ctx.fillRect(block.x * 10 + 1, block.y * 10 + 1, 9, 9);
					}

					//bright surface
					ctx.fillStyle = brightColor;
					if (t == 1 || uglyMode) {
						// ctx.fillStyle = thisColor.darker; //shadow edge
						// ctx.beginPath();
						// ctx.moveTo(block.x*10     , block.y*10 + 9 );
						// ctx.lineTo(block.x*10 + 1 , block.y*10 + 10);
						// ctx.lineTo(block.x*10 + 10, block.y*10 + 10);
						// ctx.lineTo(block.x*10 + 10, block.y*10 + 1 );
						// ctx.lineTo(block.x*10 + 9 , block.y*10     );
						// ctx.fill();

						ctx.fillRect(block.x * 10, block.y * 10, 9, 9);
						if (idForBlockSkinId == 12 && !uglyMode) {
							ctx.fillStyle = colors.gold.bevelBright;
							ctx.fillRect(block.x * 10 + 3, block.y * 10 + 0.1, 6, 0.1);
						}
					} else if (t < 0.4) {
						t2 = t * 2.5;
						ctx.beginPath();
						ctx.moveTo(block.x * 10 + 1, block.y * 10 + lerp(10, 1, t2));
						ctx.lineTo(block.x * 10 + 1, block.y * 10 + 10);
						ctx.lineTo(block.x * 10 + lerp(1, 10, t2), block.y * 10 + 10);
						ctx.fill();
					} else if (t < 0.8) {
						t2 = t * 2.5 - 1;
						ctx.beginPath();
						ctx.moveTo(block.x * 10 + 1, block.y * 10 + 1);
						ctx.lineTo(block.x * 10 + 1, block.y * 10 + 10);
						ctx.lineTo(block.x * 10 + 10, block.y * 10 + 10);
						ctx.lineTo(block.x * 10 + 10, block.y * 10 + lerp(10, 1, t2));
						ctx.lineTo(block.x * 10 + lerp(1, 10, t2), block.y * 10 + 1);
						ctx.fill();
					} else {
						t2 = t * 5 - 4;
						// ctx.fillStyle = thisColor.darker; //shadow edge
						// ctx.beginPath();
						// ctx.moveTo(block.x*10 + lerp(1,0,t2) , block.y*10 + lerp(10,9,t2) );
						// ctx.lineTo(block.x*10 + 1 , block.y*10 + 10);
						// ctx.lineTo(block.x*10 + 10, block.y*10 + 10);
						// ctx.lineTo(block.x*10 + 10, block.y*10 + 1 );
						// ctx.lineTo(block.x*10 + lerp(10,9,t2) , block.y*10 + lerp(1,0,t2)  );
						// ctx.fill();

						ctx.fillRect(block.x * 10 + lerp(1, 0, t2), block.y * 10 + lerp(1, 0, t2), 9, 9);
					}
				}
			}
		}
	}
}

//draws a player on ctx
function drawPlayer(ctx, player, timeStamp) {
	if (player.hasReceivedPosition) {
		var x, y;

		var pc = getColorForBlockSkinId(player.skinBlock); //player color

		//draw trail
		if (player.trails.length > 0) {
			//iterate over each trail
			for (var trailI = player.trails.length - 1; trailI >= 0; trailI--) {
				var thisTrail = player.trails[trailI];

				//increase vanish timer
				var last = trailI == player.trails.length - 1;
				if (!last || player.isDead) {
					if (uglyMode) {
						thisTrail.vanishTimer = 10;
					} else {
						var speed = (player.isDead && last) ? 0.006 : 0.02;
						thisTrail.vanishTimer += deltaTime * speed;
					}
					if (!last && (thisTrail.vanishTimer > 10)) {
						player.trails.splice(trailI, 1);
					}
				}

				//if there's no trail, don't draw anything
				if (thisTrail.trail.length > 0) {
					var lastPos = last ? player.drawPos : null;
					if (thisTrail.vanishTimer > 0 && !uglyMode) {
						ctxApplyCamTransform(tempCtx, true);
						drawTrailOnCtx(
							[{
								ctx: tempCtx,
								color: pc.darker,
								offset: 5,
							}, {
								ctx: tempCtx,
								color: pc.brighter,
								offset: 4,
							}],
							thisTrail.trail,
							lastPos,
						);

						tempCtx.globalCompositeOperation = "destination-out";
						drawDiagonalLines(tempCtx, "white", thisTrail.vanishTimer, 10, timeStamp * 0.003);

						ctx.restore();
						tempCtx.restore();
						linesCtx.restore();

						ctx.drawImage(tempCanvas, 0, 0);
						tempCtx.fillStyle = colors.grey.diagonalLines;
						tempCtx.globalCompositeOperation = "source-in";
						tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
						linesCtx.drawImage(tempCanvas, 0, 0);
						ctxApplyCamTransform(ctx);
						ctxApplyCamTransform(linesCtx);
					} else if (thisTrail.vanishTimer < 10) {
						if (uglyMode) {
							drawTrailOnCtx(
								[{
									ctx: ctx,
									color: pc.darker,
									offset: 5,
								}, {
									ctx: ctx,
									color: pc.brighter,
									offset: 4,
								}],
								thisTrail.trail,
								lastPos,
							);
						} else {
							drawTrailOnCtx(
								[{
									ctx: ctx,
									color: pc.darker,
									offset: 5,
								}, {
									ctx: ctx,
									color: pc.brighter,
									offset: 4,
								}, {
									ctx: linesCtx,
									color: colors.grey.diagonalLines,
									offset: 4,
								}],
								thisTrail.trail,
								lastPos,
							);
						}
					}
				}
			}
		}

		//draw player
		var dp = [player.drawPos[0] * 10 + 4.5, player.drawPos[1] * 10 + 4.5]; //draw position
		var pr = 6; //player radius
		var so = 0.3; //shadow offset
		var gradient = ctx.createRadialGradient(dp[0] - 3, dp[1] - 3, 0, dp[0], dp[1], pr);
		gradient.addColorStop(0, pc.slightlyBrighter);
		gradient.addColorStop(1, pc.brighter);
		linesCtx.fillStyle = "white";
		if (player.isDead) {
			player.isDeadTimer += deltaTime * 0.003;
			ctx.fillStyle = gradient;

			for (var i = 0; i < player.deadAnimParts.length - 1; i++) {
				var arcStart = player.deadAnimParts[i];
				var arcEnd = player.deadAnimParts[i + 1];
				var arcAvg = lerp(arcStart, arcEnd, 0.5);
				var dir = player.dir * Math.PI / 2 - Math.PI;
				var distanceModifier = Math.min(
					Math.abs(dir - arcAvg),
					Math.abs((dir - Math.PI * 2) - arcAvg),
					Math.abs((dir + Math.PI * 2) - arcAvg),
				);
				var rand = player.deadAnimPartsRandDist[i];
				var distance = (1 - Math.pow(2, -2 * player.isDeadTimer)) * distanceModifier * 5 * (rand + 1);
				var pOffset = [Math.cos(arcAvg) * distance, Math.sin(arcAvg) * distance]; //piece offset
				ctx.globalAlpha = linesCtx.globalAlpha = Math.max(0, 1 - (player.isDeadTimer * 0.2));
				ctx.beginPath();
				ctx.arc(dp[0] - so + pOffset[0], dp[1] - so + pOffset[1], pr, arcStart, arcEnd, false);
				ctx.lineTo(dp[0] - so + pOffset[0], dp[1] - so + pOffset[1]);
				ctx.fill();
				if (!uglyMode) {
					linesCtx.beginPath();
					linesCtx.arc(dp[0] - so + pOffset[0], dp[1] - so + pOffset[1], pr, arcStart, arcEnd, false);
					linesCtx.lineTo(dp[0] - so + pOffset[0], dp[1] - so + pOffset[1]);
					linesCtx.fill();
				}
			}
			ctx.globalAlpha = linesCtx.globalAlpha = 1;
		} else {
			ctx.fillStyle = pc.darker;
			ctx.beginPath();
			ctx.arc(dp[0] + so, dp[1] + so, pr, 0, 2 * Math.PI, false);
			ctx.fill();
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(dp[0] - so, dp[1] - so, pr, 0, 2 * Math.PI, false);
			ctx.fill();
			if (player.isMyPlayer && localStorage.drawWhiteDot == "true") {
				ctx.fillStyle = "white";
				ctx.beginPath();
				ctx.arc(dp[0] - so, dp[1] - so, 1, 0, 2 * Math.PI, false);
				ctx.fill();
			}

			//lines canvas (remove lines)
			if (!uglyMode) {
				linesCtx.beginPath();
				linesCtx.arc(dp[0] + so, dp[1] + so, pr, 0, 2 * Math.PI, false);
				linesCtx.fill();
				linesCtx.beginPath();
				linesCtx.arc(dp[0] - so, dp[1] - so, pr, 0, 2 * Math.PI, false);
				linesCtx.fill();
			}
		}
		if (player.isMyPlayer && localStorage.drawActualPlayerPos == "true") {
			ctx.fillStyle = "#FF0000";
			ctx.beginPath();
			ctx.arc(player.serverPos[0] * 10 + 5, player.serverPos[1] * 10 + 5, pr, 0, 2 * Math.PI, false);
			ctx.fill();
		}

		//draw hitlines
		if (player.hitLines.length > 0) {
			for (var hitlineI = player.hitLines.length - 1; hitlineI >= 0; hitlineI--) {
				var thisHit = player.hitLines[hitlineI];

				//increase vanish timer
				thisHit.vanishTimer += deltaTime * 0.004;
				var t = thisHit.vanishTimer;
				if (t > 4) {
					player.hitLines.splice(hitlineI, 1);
				}

				x = thisHit.pos[0] * 10 + 5;
				y = thisHit.pos[1] * 10 + 5;

				//draw circle
				if (t < 2) {
					var radius1 = Math.max(0, ease.out(iLerp(0, 2, t)) * 18);
					var radius2 = Math.max(0, ease.out(iLerp(0.5, 2, t)) * 18);
					ctx.fillStyle = pc.brighter;
					ctx.beginPath();
					ctx.arc(x, y, radius1, 0, 2 * Math.PI, false);
					ctx.arc(x, y, radius2, 0, 2 * Math.PI, false);
					ctx.fill("evenodd");

					if (!uglyMode) {
						//lines canvas (remove lines)
						linesCtx.beginPath();
						linesCtx.arc(x, y, radius1, 0, 2 * Math.PI, false);
						linesCtx.arc(x, y, radius2, 0, 2 * Math.PI, false);
						linesCtx.fill("evenodd");
					}
				}

				//draw 500+
				if (thisHit.color !== undefined && player.isMyPlayer) {
					ctx.save();
					ctx.font = linesCtx.font = "6px Arial, Helvetica, sans-serif";
					ctx.fillStyle = thisHit.color.brighter;
					ctx.shadowColor = thisHit.color.darker;
					ctx.shadowOffsetX = ctx.shadowOffsetY = 0.4 * MAX_PIXEL_RATIO * zoom * canvasQuality;
					w = ctx.measureText("+500").width;
					var hOffset;
					var opacity;
					if (t < 0.5) {
						opacity = iLerp(0, 0.5, t);
					} else if (t < 3.5) {
						opacity = 1;
					} else {
						opacity = iLerp(4, 3.5, t);
					}
					opacity = clamp01(opacity);
					if (t < 2) {
						hOffset = ease.out(t / 2) * 20;
					} else {
						hOffset = 20;
					}
					ctx.globalAlpha = opacity;
					ctx.fillText("+500", x - w / 2, y - hOffset);
					ctx.restore();
				}
			}
		}

		//draw honk
		if (player.honkTimer < player.honkMaxTime) {
			player.honkTimer += deltaTime * 0.255;
			ctx.fillStyle = pc.brighter;
			ctx.globalAlpha = clamp01(iLerp(player.honkMaxTime, 0, player.honkTimer));
			ctx.beginPath();
			ctx.arc(
				player.drawPos[0] * 10 + 4.5 + so,
				player.drawPos[1] * 10 + 4.5 + so,
				pr + player.honkTimer * 0.1,
				0,
				2 * Math.PI,
				false,
			);
			ctx.fill();
			ctx.globalAlpha = 1;

			if (!uglyMode) {
				linesCtx.globalAlpha = clamp01(iLerp(player.honkMaxTime, 0, player.honkTimer));
				linesCtx.beginPath();
				linesCtx.arc(
					player.drawPos[0] * 10 + 4.5 + so,
					player.drawPos[1] * 10 + 4.5 + so,
					pr + player.honkTimer * 0.1,
					0,
					2 * Math.PI,
					false,
				);
				linesCtx.fill();
				linesCtx.globalAlpha = 1;
			}
		}

		//draw name
		if (localStorage.hidePlayerNames != "true") {
			myNameAlphaTimer += deltaTime * 0.001;
			ctx.font = linesCtx.font = USERNAME_SIZE + "px Arial, Helvetica, sans-serif";
			if (player.name) {
				var deadAlpha = 1;
				var myAlpha = 1;
				if (player.isMyPlayer) {
					myAlpha = 9 - myNameAlphaTimer;
				}
				if (player.isDead) {
					deadAlpha = 1 - player.isDeadTimer;
				}
				var alpha = Math.min(deadAlpha, myAlpha);
				if (alpha > 0) {
					ctx.save();
					if (!uglyMode) {
						linesCtx.save();
					}
					ctx.globalAlpha = clamp01(alpha);
					var width = ctx.measureText(player.name).width;
					width = Math.min(100, width);
					x = player.drawPos[0] * 10 + 5 - width / 2;
					y = player.drawPos[1] * 10 - 5;

					ctx.rect(x - 4, y - USERNAME_SIZE * 1.2, width + 8, USERNAME_SIZE * 2);
					ctx.clip();
					if (!uglyMode) {
						linesCtx.rect(x - 4, y - USERNAME_SIZE * 1.2, width + 8, USERNAME_SIZE * 2);
						linesCtx.clip();
						linesCtx.fillText(player.name, x, y);
					}

					ctx.shadowColor = "rgba(0,0,0,0.9)";
					ctx.shadowBlur = 10;
					ctx.shadowOffsetX = ctx.shadowOffsetY = 2;
					ctx.fillStyle = pc.brighter;
					ctx.fillText(player.name, x, y);

					ctx.shadowColor = pc.darker;
					ctx.shadowBlur = 0;
					ctx.shadowOffsetX = ctx.shadowOffsetY = 0.8;
					ctx.fillText(player.name, x, y);

					ctx.restore();
					if (!uglyMode) {
						linesCtx.restore();
					}
				}
			}
		}

		//draw cool shades
		if (player.name == "Jesper" && !player.isDead) {
			ctx.fillStyle = "black";
			ctx.fillRect(dp[0] - 6.5, dp[1] - 2, 13, 1);
			ctx.fillRect(dp[0] - 1, dp[1] - 2, 2, 2);
			ctx.fillRect(dp[0] - 5.5, dp[1] - 2, 5, 3);
			ctx.fillRect(dp[0] + 0.5, dp[1] - 2, 5, 3);
		}
	}
}
